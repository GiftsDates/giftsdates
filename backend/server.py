"""GiftsDates backend — dating, wallet, gifts, escrow dates, video calls, Stripe."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Request
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from pathlib import Path
from datetime import datetime, timezone, timedelta
import os, uuid, logging, bcrypt, jwt, stripe, requests, re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "giftsdates"
storage_key = None

def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
    except Exception as e:
        logging.error(f"Storage init failed: {e}")
        raise HTTPException(503, "Storage unavailable")
    return storage_key

def put_object(path: str, data: bytes, content_type: str):
    k = init_storage()
    r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": k, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    k = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": k}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

app = FastAPI()
api = APIRouter(prefix="/api")

# ---------- Constants ----------
COIN_PACKAGES = {
    "small_talk": {"coins": 100,  "amount": 9.99,   "bonus": 0,   "name": "Small Talk"},
    "starter":    {"coins": 300,  "amount": 29.99,  "bonus": 20,  "name": "Starter"},
    "popular":    {"coins": 1000, "amount": 99.99,  "bonus": 100, "name": "Popular Pack"},
    "extra":      {"coins": 2000, "amount": 189.0,  "bonus": 150, "name": "Extra Pack"},
    "vip":        {"coins": 3000, "amount": 295.0,  "bonus": 300, "name": "VIP Pack"},
}
CUSTOM_COINS_PER_USD = 10
CUSTOM_BONUS_PCT = 2
CUSTOM_MIN_USD = 1.0
COINS_PER_USD = 10  # payout rate: 10 coins = $1
MIN_WITHDRAW_USD = 50.0
CANCEL_REFUND_PCT = 0.5  # booker gets 50% back when cancelling a date; the rest compensates the recipient
PREMIUM_PACKAGE = {"lookup": "premium_monthly", "amount": 29.99, "name": "GiftsDates Premium Monthly"}
GIFT_CATALOG = [
    {"id": "rose",       "name_key": "gift_rose",       "icon": "🌹", "cost": 50},
    {"id": "chocolate",  "name_key": "gift_chocolate",  "icon": "🍫", "cost": 100},
    {"id": "champagne",  "name_key": "gift_champagne",  "icon": "🍾", "cost": 200},
    {"id": "dress",      "name_key": "gift_dress",      "icon": "👗", "cost": 400},
    {"id": "perfume",    "name_key": "gift_perfume",    "icon": "🧴", "cost": 800},
    {"id": "watch",      "name_key": "gift_watch",      "icon": "⌚", "cost": 1000},
    {"id": "jewelry",    "name_key": "gift_jewelry",    "icon": "💎", "cost": 1500},
    {"id": "ring",       "name_key": "gift_ring",       "icon": "💍", "cost": 5000},
]
GIFT_COMMISSION = 0.30
VIDEO_RATE_PER_MIN = 10
DATE_MIN_COINS = 300
REFERRAL_BONUS = 100
MAX_PHOTOS = 12
PHONE_RE = re.compile(r"(?:\+?\d[\s\-\.\(\)_]*){7,}")
PHONE_WORDS_RE = re.compile(r"\b(whatsapp|telegram|viber|wechat|signal|тел[её]фон|ватсап|телеграм)\b", re.I)
MAX_VIOLATIONS = 3
BLOCK_DAYS = 7
FREE_DAILY_LIKES = 15

def contains_phone(text: str) -> bool:
    return bool(PHONE_RE.search(text)) or bool(PHONE_WORDS_RE.search(text) and re.search(r"\d{4,}", text))

DEFAULT_SETTINGS = {
    "gifts": GIFT_CATALOG,
    "coin_packages": [{"id": k, **v} for k, v in COIN_PACKAGES.items()],
    "premium_amount": PREMIUM_PACKAGE["amount"],
    "video_rate": VIDEO_RATE_PER_MIN,
    "date_min_coins": DATE_MIN_COINS,
    "referral_bonus": REFERRAL_BONUS,
    "commission": GIFT_COMMISSION,
    "free_daily_likes": FREE_DAILY_LIKES,
    "custom_coins_per_usd": CUSTOM_COINS_PER_USD,
    "custom_bonus_pct": CUSTOM_BONUS_PCT,
    "custom_min_usd": CUSTOM_MIN_USD,
    "coins_per_usd": COINS_PER_USD,
    "min_withdraw_usd": MIN_WITHDRAW_USD,
    "referral_package_id": "popular",
    "cancel_refund_pct": CANCEL_REFUND_PCT,
    "gift_auto_match_coins": 100,
}

async def ensure_match(a_id: str, b_id: str, reason: str = "like") -> tuple[str, bool]:
    exists = await db.matches.find_one({"users": {"$all": [a_id, b_id]}})
    if exists: return exists["id"], False
    now = datetime.now(timezone.utc).isoformat()
    conv_id = str(uuid.uuid4())
    await db.matches.insert_one({"id": conv_id, "users": [a_id, b_id], "created_at": now, "reason": reason})
    await db.conversations.insert_one({"id": conv_id, "users": [a_id, b_id], "created_at": now, "last_message": None})
    return conv_id, True

async def get_settings() -> dict:
    doc = await db.settings.find_one({"id": "pricing"}, {"_id": 0, "id": 0}) or {}
    return {**DEFAULT_SETTINGS, **doc}

def is_premium(u: dict) -> bool:
    pu = u.get("premium_until")
    if not pu: return False
    try: return datetime.fromisoformat(pu.replace("Z", "+00:00")) > datetime.now(timezone.utc)
    except Exception: return False

async def notify(user_id: str, ntype: str, title: str, body: str, data: dict | None = None, email: bool = False):
    now = datetime.now(timezone.utc).isoformat()
    await db.notifications.insert_one({"id": str(uuid.uuid4()), "user_id": user_id, "type": ntype, "title": title,
                                       "body": body, "data": data or {}, "read": False, "created_at": now})
    if email:
        u = await db.users.find_one({"id": user_id}, {"email": 1})
        if u:
            # MOCKED email delivery: stored in outbox until a real provider (Resend/SendGrid) is connected
            await db.email_outbox.insert_one({"id": str(uuid.uuid4()), "to": u["email"], "subject": title, "body": body, "status": "queued", "created_at": now})
            logging.info(f"[EMAIL MOCK] to={u['email']} subject={title}")

# ---------- Auth helpers ----------
def hash_pwd(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def verify_pwd(p: str, h: str) -> bool:
    try: return bcrypt.checkpw(p.encode(), h.encode())
    except Exception: return False
def make_token(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30)}, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(authorization: Optional[str] = Header(None), auth: Optional[str] = None):
    tok = None
    if authorization and authorization.startswith("Bearer "):
        tok = authorization.split(" ", 1)[1]
    elif auth:
        tok = auth
    if not tok:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(401, "User not found")
    bu = user.get("blocked_until")
    if bu and datetime.fromisoformat(bu.replace("Z", "+00:00")) > datetime.now(timezone.utc):
        raise HTTPException(403, f"BLOCKED:{bu}")
    if not user.get("referral_code"):
        user["referral_code"] = user["id"][:8].upper()
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": user["referral_code"]}})
    now = datetime.now(timezone.utc)
    ls = user.get("last_seen")
    if not ls or (now - datetime.fromisoformat(ls.replace("Z", "+00:00"))).total_seconds() > 60:
        user["last_seen"] = now.isoformat()
        await db.users.update_one({"id": user["id"]}, {"$set": {"last_seen": user["last_seen"]}})
    return user

async def have_met(a: str, b: str) -> bool:
    return bool(await db.date_bookings.find_one({"status": {"$in": ["confirmed", "released"]}, "$or": [{"from_id": a, "to_id": b}, {"from_id": b, "to_id": a}]}))

# ---------- Models ----------
class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    name: str
    age: int
    gender: str
    interested_in: str
    orientation: Optional[str] = "straight"
    city: str
    country: str
    bio: Optional[str] = ""
    referral_code: Optional[str] = None

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    bio: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    interests: Optional[List[str]] = None
    photos: Optional[List[str]] = None
    language: Optional[str] = None
    relationship_intent: Optional[str] = None
    orientation: Optional[str] = None
    gender: Optional[str] = None
    hobbies: Optional[List[str]] = None
    height: Optional[int] = None
    weight: Optional[int] = None
    languages_spoken: Optional[List[str]] = None
    job_title: Optional[str] = None
    income: Optional[str] = None
    income_custom: Optional[str] = None
    kids: Optional[str] = None
    smoking: Optional[str] = None
    drinking: Optional[str] = None
    religion: Optional[str] = None
    bust_size: Optional[str] = None
    penis_size: Optional[str] = None
    date_price: Optional[int] = None
    video_rate: Optional[int] = None  # coins per minute, >= global video_rate
    availability: Optional[List[str]] = None  # ISO dates YYYY-MM-DD when user is open for dates
    availability_time: Optional[dict] = None  # {"from": "18:00", "to": "23:00"} default window
    availability_slots: Optional[dict] = None  # {"YYYY-MM-DD": {"from": "..", "to": ".."}} per-day overrides

class LikeReq(BaseModel):
    target_id: str

class GiftReq(BaseModel):
    target_id: str
    gift_id: str  # catalog id or "custom"
    message: Optional[str] = ""
    custom_icon: Optional[str] = None
    custom_cost: Optional[int] = None
    conversation_id: Optional[str] = None

CUSTOM_GIFT_MIN = 10

class VideoCallReq(BaseModel):
    target_id: str
    minutes: int

class DateBookingReq(BaseModel):
    target_id: str
    venue: str
    city: str
    scheduled_at: str  # ISO
    coins: int
    local_time: Optional[str] = None  # HH:MM in booker's local time, used for availability window check
    address: Optional[str] = ""
    postal_code: Optional[str] = ""
    country: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None

class DateConfirmReq(BaseModel):
    booking_id: str
    photo_url: str

class WithdrawReq(BaseModel):
    amount: float

class PayoutAccountReq(BaseModel):
    # recipient
    tax_id: str
    holder_name: str  # full name
    recipient_street: str
    recipient_city: str
    recipient_province: str
    recipient_postal_code: str
    country: str  # recipient country
    recipient_email: str
    # bank
    iban: str  # account number / IBAN
    swift: str
    routing_number: Optional[str] = ""
    bank_name: str
    bank_street: str
    bank_city: str
    bank_province: str
    bank_postal_code: str
    bank_country: str
    document_path: Optional[str] = None

class AdminVerifyReq(BaseModel):
    approve: bool
    reason: Optional[str] = ""

ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}
def is_admin(u: dict) -> bool:
    return u.get("is_admin") is True or u["email"].lower() in ADMIN_EMAILS
async def get_admin(user=Depends(get_current_user)):
    if not is_admin(user): raise HTTPException(403, "Admin only")
    return user

class CheckoutReq(BaseModel):
    package_id: str  # coin package id, "custom" or "premium_monthly"
    origin_url: str
    usd_amount: Optional[float] = None  # for custom

class MessageReq(BaseModel):
    conversation_id: str
    text: str

# ---------- Startup ----------
@app.on_event("startup")
async def _startup():
    init_storage()
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.likes.create_index([("from_id", 1), ("to_id", 1)], unique=True)
    await db.notifications.create_index([("user_id", 1), ("read", 1)])
    logging.info("GiftsDates backend ready")

# ---------- Meta ----------
@api.get("/meta")
async def meta():
    s = await get_settings()
    return {
        "gifts": s["gifts"],
        "coin_packages": s["coin_packages"],
        "premium": {**PREMIUM_PACKAGE, "amount": s["premium_amount"]},
        "video_rate": s["video_rate"],
        "gift_commission": s["commission"],
        "date_min_coins": s["date_min_coins"],
        "referral_bonus": s["referral_bonus"],
        "referral_package": next((p for p in s["coin_packages"] if p["id"] == s.get("referral_package_id")), None),
        "free_daily_likes": s["free_daily_likes"],
        "custom_coins": {"per_usd": s["custom_coins_per_usd"], "bonus_pct": s["custom_bonus_pct"], "min_usd": s["custom_min_usd"]},
        "coins_per_usd": s["coins_per_usd"],
        "cancel_refund_pct": s.get("cancel_refund_pct", CANCEL_REFUND_PCT),
        "gift_auto_match_coins": s.get("gift_auto_match_coins", 100),
        "max_photos": MAX_PHOTOS,
    }

# ---------- Auth ----------
@api.post("/auth/register")
async def register(req: RegisterReq):
    if await db.users.find_one({"email": req.email.lower()}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    referrer = None
    if req.referral_code:
        referrer = await db.users.find_one({"referral_code": req.referral_code.strip().upper()}, {"id": 1})
    doc = {
        "id": uid, "email": req.email.lower(), "password": hash_pwd(req.password),
        "name": req.name, "age": req.age, "gender": req.gender,
        "interested_in": req.interested_in, "orientation": req.orientation or "straight", "city": req.city, "country": req.country,
        "bio": req.bio or "", "interests": [], "photos": [], "language": "en",
        "coins": 100,  # welcome bonus
        "escrow": 0.0, "withdrawable": 0.0,
        "premium_until": None, "verified": False,
        "referral_code": uid[:8].upper(), "referred_by": referrer["id"] if referrer else None,
        "referral_rewarded": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"token": make_token(uid), "user": {k: v for k, v in doc.items() if k not in ("password", "_id")}}

@api.post("/auth/login")
async def login(req: LoginReq):
    u = await db.users.find_one({"email": req.email.lower()})
    if not u or not verify_pwd(req.password, u["password"]):
        raise HTTPException(401, "Invalid credentials")
    bu = u.get("blocked_until")
    if bu and datetime.fromisoformat(bu.replace("Z", "+00:00")) > datetime.now(timezone.utc):
        raise HTTPException(403, f"BLOCKED:{bu}")
    return {"token": make_token(u["id"]), "user": {k: v for k, v in u.items() if k not in ("password", "_id")}}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

@api.patch("/auth/me")
async def update_me(patch: ProfileUpdate, user=Depends(get_current_user)):
    upd = {k: v for k, v in patch.model_dump().items() if v is not None}
    if "height" in upd and not (100 <= upd["height"] <= 250): raise HTTPException(400, "Height must be 100-250 cm")
    if "weight" in upd and not (30 <= upd["weight"] <= 300): raise HTTPException(400, "Weight must be 30-300 kg")
    if "date_price" in upd:
        mn = (await get_settings())["date_min_coins"]
        if upd["date_price"] < mn: raise HTTPException(400, f"Date price must be at least {mn} coins")
    if "photos" in upd and len(upd["photos"]) > MAX_PHOTOS:
        raise HTTPException(400, f"Max {MAX_PHOTOS} photos")
    if "video_rate" in upd:
        mn = (await get_settings())["video_rate"]
        if upd["video_rate"] < mn: raise HTTPException(400, f"Video rate must be at least {mn} coins/min")
    if "availability" in upd:
        upd["availability"] = sorted({d[:10] for d in upd["availability"] if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d[:10])})
    def _win_ok(w): return isinstance(w, dict) and re.fullmatch(r"\d{2}:\d{2}", str(w.get("from", ""))) and re.fullmatch(r"\d{2}:\d{2}", str(w.get("to", ""))) and w["from"] < w["to"]
    if "availability_time" in upd and upd["availability_time"] and not _win_ok(upd["availability_time"]): raise HTTPException(400, "Invalid time window")
    if "availability_slots" in upd:
        upd["availability_slots"] = {k[:10]: v for k, v in (upd["availability_slots"] or {}).items() if re.fullmatch(r"\d{4}-\d{2}-\d{2}", k[:10]) and _win_ok(v)}
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password": 0})
    return fresh

# ---------- Uploads ----------
@api.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    ext = (file.filename.split(".")[-1] if "." in file.filename else "bin").lower()
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    ct = file.content_type or "application/octet-stream"
    result = put_object(path, data, ct)
    await db.files.insert_one({
        "id": str(uuid.uuid4()), "storage_path": result["path"],
        "user_id": user["id"], "content_type": ct, "size": result["size"],
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}

@api.post("/profile/photos")
async def add_photo(file: UploadFile = File(...), user=Depends(get_current_user)):
    photos = user.get("photos") or []
    if len(photos) >= MAX_PHOTOS: raise HTTPException(400, f"Max {MAX_PHOTOS} photos")
    if not (file.content_type or "").startswith("image/"): raise HTTPException(400, "Only images allowed")
    ext = (file.filename.split(".")[-1] if "." in file.filename else "jpg").lower()
    path = f"{APP_NAME}/photos/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type)
    await db.files.insert_one({"id": str(uuid.uuid4()), "storage_path": result["path"], "user_id": user["id"],
                               "content_type": file.content_type, "size": result["size"], "is_deleted": False,
                               "created_at": datetime.now(timezone.utc).isoformat()})
    photos.append(result["path"])
    await db.users.update_one({"id": user["id"]}, {"$set": {"photos": photos}})
    return {"photos": photos}

class PhotoReq(BaseModel):
    path: str

@api.delete("/profile/photos")
async def delete_photo(req: PhotoReq, user=Depends(get_current_user)):
    photos = [p for p in (user.get("photos") or []) if p != req.path]
    await db.users.update_one({"id": user["id"]}, {"$set": {"photos": photos}})
    await db.files.update_one({"storage_path": req.path, "user_id": user["id"]}, {"$set": {"is_deleted": True}})
    return {"photos": photos}

@api.post("/profile/photos/primary")
async def primary_photo(req: PhotoReq, user=Depends(get_current_user)):
    photos = user.get("photos") or []
    if req.path not in photos: raise HTTPException(404, "Photo not found")
    photos = [req.path] + [p for p in photos if p != req.path]
    await db.users.update_one({"id": user["id"]}, {"$set": {"photos": photos}})
    return {"photos": photos}

# ---------- Identity verification (ID + selfie) ----------
@api.post("/verification/upload")
async def verification_upload(kind: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    if kind not in ("id", "selfie"): raise HTTPException(400, "kind must be id or selfie")
    if not (file.content_type or "").startswith("image/"): raise HTTPException(400, "Only images allowed")
    v = user.get("verification") or {}
    if v.get("status") == "verified": raise HTTPException(400, "Already verified")
    ext = (file.filename.split(".")[-1] if "." in file.filename else "jpg").lower()
    path = f"{APP_NAME}/verification/{user['id']}/{kind}-{uuid.uuid4()}.{ext}"
    result = put_object(path, await file.read(), file.content_type)
    await db.files.insert_one({"id": str(uuid.uuid4()), "storage_path": result["path"], "user_id": user["id"], "private": True,
                               "content_type": file.content_type, "size": result["size"], "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()})
    v[f"{kind}_path"] = result["path"]
    v["status"] = "pending" if v.get("id_path") and v.get("selfie_path") else "incomplete"
    v["reason"] = ""
    if v["status"] == "pending": v["submitted_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": {"verification": v}})
    return v

@api.get("/verification")
async def verification_status(user=Depends(get_current_user)):
    return user.get("verification") or {"status": "none"}

@api.get("/admin/verifications")
async def admin_verifications(status: str = "pending", admin=Depends(get_admin)):
    q = {"verification.status": status} if status != "all" else {"verification": {"$exists": True}}
    users = await db.users.find(q, {"_id": 0, "id": 1, "name": 1, "email": 1, "age": 1, "city": 1, "country": 1, "verification": 1, "verified": 1}).sort("verification.submitted_at", -1).to_list(200)
    return users

@api.post("/admin/verifications/{user_id}/verify")
async def admin_verify_identity(user_id: str, req: AdminVerifyReq, admin=Depends(get_admin)):
    u = await db.users.find_one({"id": user_id})
    if not u or not u.get("verification"): raise HTTPException(404, "Not found")
    status = "verified" if req.approve else "rejected"
    await db.users.update_one({"id": user_id}, {"$set": {"verified": req.approve, "verification.status": status, "verification.reason": req.reason or "",
                                                          "verification.reviewed_at": datetime.now(timezone.utc).isoformat(), "verification.reviewed_by": admin["id"]}})
    await notify(user_id, "identity", "Identity verified ✅" if req.approve else "Identity verification rejected",
                 "Your profile now has the verified badge." if req.approve else (req.reason or "Please upload clearer photos of your ID and selfie."), email=True)
    return {"status": status}

@api.get("/files/{path:path}")
async def download(path: str, authorization: Optional[str] = Header(None), auth: Optional[str] = None):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "Not found")
    if rec.get("private"):
        token = auth or (authorization.split(" ", 1)[1] if authorization and " " in authorization else None)
        try: uid = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])["sub"] if token else None
        except Exception: uid = None
        viewer = await db.users.find_one({"id": uid}) if uid else None
        if not viewer or (viewer["id"] != rec["user_id"] and viewer["id"] not in (rec.get("viewers") or []) and not is_admin(viewer)): raise HTTPException(403, "Private file")
    data, ct = get_object(path)
    return Response(content=data, media_type=rec.get("content_type") or ct)

# ---------- Profiles / Search ----------
@api.get("/profiles")
async def list_profiles(
    q: Optional[str] = None, city: Optional[str] = None, country: Optional[str] = None,
    min_age: int = 18, max_age: int = 99, gender: Optional[str] = None,
    intent: Optional[str] = None, min_height: Optional[int] = None, max_height: Optional[int] = None,
    kids: Optional[str] = None, smoking: Optional[str] = None, religion: Optional[str] = None, orientation: Optional[str] = None,
    drinking: Optional[str] = None, income: Optional[str] = None, language: Optional[str] = None,
    hobby: Optional[str] = None, job: Optional[str] = None, min_weight: Optional[int] = None, max_weight: Optional[int] = None,
    bust_size: Optional[str] = None, penis_size: Optional[str] = None, max_date_price: Optional[int] = None,
    premium_only: bool = False, with_photos: bool = False, verified_only: bool = False,
    limit: int = 40, user=Depends(get_current_user)
):
    conds = [{"id": {"$ne": user["id"]}}, {"age": {"$gte": min_age, "$lte": max_age}}]
    advanced_used = any(v not in (None, "", "all", False) for v in (intent, min_height, max_height, kids, smoking, religion, drinking, income, language, orientation,
                                                                   hobby, job, min_weight, max_weight, bust_size, penis_size, max_date_price, premium_only, with_photos, verified_only))
    if advanced_used and not is_premium(user): raise HTTPException(403, "PREMIUM_REQUIRED")
    if city: conds.append({"city": {"$regex": city, "$options": "i"}})
    if country: conds.append({"country": {"$regex": country, "$options": "i"}})
    if gender and gender != "all": conds.append({"gender": gender})
    if q: conds.append({"$or": [{"name": {"$regex": q, "$options": "i"}}, {"bio": {"$regex": q, "$options": "i"}}]})
    for field, val in (("relationship_intent", intent), ("kids", kids), ("smoking", smoking), ("religion", religion), ("orientation", orientation),
                       ("drinking", drinking), ("income", income), ("bust_size", bust_size), ("penis_size", penis_size)):
        if val and val != "all": conds.append({field: val})
    if language and language != "all": conds.append({"languages_spoken": language})
    if hobby: conds.append({"hobbies": {"$elemMatch": {"$regex": re.escape(hobby), "$options": "i"}}})
    if job: conds.append({"job_title": {"$regex": re.escape(job), "$options": "i"}})
    for field, lo, hi in (("height", min_height, max_height), ("weight", min_weight, max_weight)):
        if lo or hi:
            r = {}
            if lo: r["$gte"] = lo
            if hi: r["$lte"] = hi
            conds.append({field: r})
    if max_date_price: conds.append({"$or": [{"date_price": {"$lte": max_date_price}}, {"date_price": None}, {"date_price": {"$exists": False}}]})
    if with_photos: conds.append({"photos.0": {"$exists": True}})
    if verified_only: conds.append({"verified": True})
    now_iso = datetime.now(timezone.utc).isoformat()
    if premium_only: conds.append({"premium_until": {"$gt": now_iso}})
    proj = {"_id": 0, "password": 0, "email": 0, "referred_by": 0, "referral_code": 0}
    boosted = await db.users.find({"$and": conds + [{"premium_until": {"$gt": now_iso}}]}, proj).limit(limit).to_list(limit)
    rest_limit = max(limit - len(boosted), 0)
    rest = await db.users.find({"$and": conds + [{"$or": [{"premium_until": None}, {"premium_until": {"$lte": now_iso}}, {"premium_until": {"$exists": False}}]}]},
                               proj).limit(rest_limit).to_list(rest_limit) if rest_limit else []
    for p in boosted: p["is_premium"] = True
    for p in rest: p["is_premium"] = False
    return boosted + rest

@api.get("/profiles/{pid}")
async def profile_detail(pid: str, user=Depends(get_current_user)):
    p = await db.users.find_one({"id": pid}, {"_id": 0, "password": 0, "email": 0, "referred_by": 0, "referral_code": 0})
    if not p: raise HTTPException(404, "Not found")
    p["is_premium"] = is_premium(p)
    p["liked_by_me"] = bool(await db.likes.find_one({"from_id": user["id"], "to_id": pid}))
    m = await db.matches.find_one({"users": {"$all": [user["id"], pid]}})
    p["conversation_id"] = m["id"] if m else None
    agg = await db.transactions.aggregate([{"$match": {"to_id": pid, "type": "gift"}}, {"$group": {"_id": "$from_id", "total": {"$sum": "$cost"}, "count": {"$sum": 1}}}, {"$sort": {"total": -1}}]).to_list(1000)
    p["gifts_total"] = sum(a["total"] for a in agg)
    p["gifts_count"] = sum(a["count"] for a in agg)
    top = []
    for a in agg[:3]:
        g = await db.users.find_one({"id": a["_id"]}, {"_id": 0, "id": 1, "name": 1, "photos": 1})
        if g: top.append({"id": g["id"], "name": g["name"], "photo": (g.get("photos") or [None])[0], "total": a["total"], "count": a["count"]})
    p["top_givers"] = top
    return p

# ---------- Likes / Matches ----------
@api.post("/likes")
async def like(req: LikeReq, user=Depends(get_current_user)):
    if req.target_id == user["id"]: raise HTTPException(400, "Cannot like yourself")
    now = datetime.now(timezone.utc).isoformat()
    already = await db.likes.find_one({"from_id": user["id"], "to_id": req.target_id})
    if not already and not is_premium(user):
        limit = (await get_settings())["free_daily_likes"]
        day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        used = await db.likes.count_documents({"from_id": user["id"], "created_at": {"$gte": day_start}})
        if used >= limit: raise HTTPException(429, f"LIKE_LIMIT:{limit}")
    try:
        await db.likes.insert_one({"from_id": user["id"], "to_id": req.target_id, "created_at": now})
    except Exception:
        pass
    reverse = await db.likes.find_one({"from_id": req.target_id, "to_id": user["id"]})
    matched = False
    if reverse:
        matched = True
        conv_id, created = await ensure_match(user["id"], req.target_id)
        if created:
            other = await db.users.find_one({"id": req.target_id}, {"name": 1})
            await notify(req.target_id, "match", "It's a match! 💘", f"You and {user['name']} liked each other. Say hello!", {"conversation_id": conv_id, "user_id": user["id"], "name": user["name"]}, email=True)
            await notify(user["id"], "match", "It's a match! 💘", f"You and {other['name']} liked each other. Say hello!", {"conversation_id": conv_id, "user_id": req.target_id, "name": other["name"]}, email=True)
    return {"liked": True, "matched": matched}

@api.get("/likes/received")
async def likes_received(user=Depends(get_current_user)):
    likes = await db.likes.find({"to_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    matched = {u for m in await db.matches.find({"users": user["id"]}, {"_id": 0, "users": 1}).to_list(500) for u in m["users"]}
    premium = is_premium(user)
    items = []
    for lk in likes:
        if lk["from_id"] in matched: continue
        u = await db.users.find_one({"id": lk["from_id"]}, {"_id": 0, "id": 1, "name": 1, "age": 1, "city": 1, "country": 1, "photos": 1})
        if not u: continue
        if premium: items.append({**u, "liked_at": lk["created_at"]})
        else: items.append({"id": u["id"], "photos": u.get("photos", [])[:1], "liked_at": lk["created_at"]})
    return {"premium": premium, "count": len(items), "items": items}

@api.get("/likes/quota")
async def likes_quota(user=Depends(get_current_user)):
    limit = (await get_settings())["free_daily_likes"]
    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    used = await db.likes.count_documents({"from_id": user["id"], "created_at": {"$gte": day_start}})
    prem = is_premium(user)
    return {"premium": prem, "limit": None if prem else limit, "used": used, "remaining": None if prem else max(limit - used, 0)}

# ---------- Notifications ----------
@api.get("/notifications")
async def list_notifications(unread_only: bool = False, user=Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if unread_only: q["read"] = False
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(50)
    unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"items": items, "unread": unread}

@api.post("/notifications/read")
async def read_notifications(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}

# ---------- Referrals ----------
@api.get("/referrals")
async def referrals(user=Depends(get_current_user)):
    invited = await db.users.find({"referred_by": user["id"]}, {"_id": 0, "name": 1, "created_at": 1, "referral_rewarded": 1}).to_list(200)
    earned = await db.transactions.find({"to_id": user["id"], "type": "referral_bonus"}, {"_id": 0}).to_list(500)
    s = await get_settings()
    pkg = next((p for p in s["coin_packages"] if p["id"] == s.get("referral_package_id")), None)
    return {"code": user["referral_code"], "bonus": s["referral_bonus"], "package": pkg, "invited": invited,
            "earned": sum(t["cost"] for t in earned), "rewarded_count": len(earned)}

async def _reward_referrer(buyer_id: str):
    buyer = await db.users.find_one({"id": buyer_id})
    if not buyer or not buyer.get("referred_by") or buyer.get("referral_rewarded"): return
    res = await db.users.update_one({"id": buyer_id, "referral_rewarded": {"$ne": True}}, {"$set": {"referral_rewarded": True}})
    if res.modified_count == 0: return
    bonus = (await get_settings())["referral_bonus"]
    await db.users.update_one({"id": buyer["referred_by"]}, {"$inc": {"coins": bonus}})
    await db.transactions.insert_one({"id": str(uuid.uuid4()), "type": "referral_bonus", "from_id": buyer_id, "to_id": buyer["referred_by"],
                                      "cost": bonus, "net": bonus, "created_at": datetime.now(timezone.utc).isoformat()})
    await notify(buyer["referred_by"], "referral", f"+{bonus} 🪙 referral bonus", f"{buyer['name']} bought their first pack. Thanks for inviting!", {"user_id": buyer_id})

@api.get("/matches")
async def my_matches(user=Depends(get_current_user)):
    matches = await db.matches.find({"users": user["id"]}, {"_id": 0}).to_list(200)
    result = []
    for m in matches:
        other_id = [u for u in m["users"] if u != user["id"]][0]
        other = await db.users.find_one({"id": other_id}, {"_id": 0, "password": 0, "email": 0})
        if other: result.append({"conversation_id": m["id"], "user": other, "created_at": m["created_at"], "can_share_media": await have_met(user["id"], other_id)})
    return result

@api.post("/conversations/{cid}/photo")
async def send_chat_photo(cid: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": cid})
    if not conv or user["id"] not in conv["users"]: raise HTTPException(403, "No access")
    other_id = [u for u in conv["users"] if u != user["id"]][0]
    if not await have_met(user["id"], other_id): raise HTTPException(403, "MEDIA_LOCKED")
    if not (file.content_type or "").startswith("image/"): raise HTTPException(400, "Only images allowed")
    ext = (file.filename.split(".")[-1] if "." in file.filename else "jpg").lower()
    path = f"{APP_NAME}/chat/{cid}/{uuid.uuid4()}.{ext}"
    result = put_object(path, await file.read(), file.content_type)
    now = datetime.now(timezone.utc).isoformat()
    await db.files.insert_one({"id": str(uuid.uuid4()), "storage_path": result["path"], "user_id": user["id"], "viewers": conv["users"], "private": True,
                               "content_type": file.content_type, "size": result["size"], "is_deleted": False, "created_at": now})
    msg = {"id": str(uuid.uuid4()), "conversation_id": cid, "from_id": user["id"], "text": "", "type": "image", "image_path": result["path"], "created_at": now}
    await db.messages.insert_one(dict(msg))
    await db.conversations.update_one({"id": cid}, {"$set": {"last_message": "📷", "last_at": now}})
    return msg

# ---------- Chat ----------
@api.get("/conversations/{cid}/messages")
async def get_messages(cid: str, user=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": cid})
    if not conv or user["id"] not in conv["users"]: raise HTTPException(403, "No access")
    msgs = await db.messages.find({"conversation_id": cid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return msgs

@api.post("/conversations/messages")
async def send_message(req: MessageReq, user=Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": req.conversation_id})
    if not conv or user["id"] not in conv["users"]: raise HTTPException(403, "No access")
    now = datetime.now(timezone.utc).isoformat()
    if contains_phone(req.text):
        other_id = [u for u in conv["users"] if u != user["id"]][0]
        met = await db.date_bookings.find_one({"status": {"$in": ["confirmed", "released"]}, "$or": [
            {"from_id": user["id"], "to_id": other_id}, {"from_id": other_id, "to_id": user["id"]}]})
        if not met:
            violations = (user.get("violations") or 0) + 1
            upd = {"$set": {"violations": violations}}
            blocked = violations >= MAX_VIOLATIONS
            if blocked:
                until = (datetime.now(timezone.utc) + timedelta(days=BLOCK_DAYS)).isoformat()
                upd["$set"]["blocked_until"] = until
                upd["$set"]["violations"] = 0
            await db.users.update_one({"id": user["id"]}, upd)
            await db.moderation_log.insert_one({"id": str(uuid.uuid4()), "user_id": user["id"], "conversation_id": req.conversation_id,
                                                "text": req.text, "violation_no": violations, "blocked": blocked, "created_at": now})
            if blocked:
                await notify(user["id"], "blocked", "Account blocked 🚫", f"Repeated attempts to share a phone number before a date. Blocked for {BLOCK_DAYS} days.", {"until": until}, email=True)
                raise HTTPException(403, f"BLOCKED:{until}")
            await notify(user["id"], "warning", "Warning ⚠️", f"Sharing phone numbers before a confirmed date is not allowed. Warning {violations}/{MAX_VIOLATIONS} — next violations lead to a block.", {"violations": violations})
            raise HTTPException(400, f"PHONE_BLOCKED:{violations}:{MAX_VIOLATIONS}")
    msg = {"id": str(uuid.uuid4()), "conversation_id": req.conversation_id, "from_id": user["id"], "text": req.text, "created_at": now, "type": "text"}
    await db.messages.insert_one(dict(msg))
    await db.conversations.update_one({"id": req.conversation_id}, {"$set": {"last_message": req.text, "last_at": now}})
    return msg

# ---------- Gifts ----------
async def _find_gift(gid):
    return next((g for g in (await get_settings())["gifts"] if g["id"] == gid), None)

@api.post("/gifts/send")
async def send_gift(req: GiftReq, user=Depends(get_current_user)):
    if req.gift_id == "custom":
        icon = (req.custom_icon or "🎁").strip()[:4] or "🎁"
        if not req.custom_cost or req.custom_cost < CUSTOM_GIFT_MIN: raise HTTPException(400, f"Minimum {CUSTOM_GIFT_MIN} coins")
        gift = {"id": "custom", "name_key": "gift_custom", "icon": icon, "cost": int(req.custom_cost)}
    else:
        gift = await _find_gift(req.gift_id)
    if not gift: raise HTTPException(400, "Unknown gift")
    if user["coins"] < gift["cost"]: raise HTTPException(400, "Insufficient coins")
    target = await db.users.find_one({"id": req.target_id})
    if not target: raise HTTPException(404, "Recipient not found")
    # full value credited to recipient; 30% commission is withheld at withdrawal time
    net = gift["cost"]
    commission = round(gift["cost"] * (await get_settings())["commission"], 2)
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": -gift["cost"]}})
    await db.users.update_one({"id": req.target_id}, {"$inc": {"withdrawable": net}})
    tx = {"id": str(uuid.uuid4()), "type": "gift", "from_id": user["id"], "to_id": req.target_id,
          "gift_id": gift["id"], "gift_icon": gift["icon"], "cost": gift["cost"],
          "commission": commission, "net": net, "message": req.message, "created_at": now}
    await db.transactions.insert_one(tx)
    s = await get_settings()
    conv_id = req.conversation_id
    auto_matched = False
    if gift["cost"] >= s.get("gift_auto_match_coins", 100):
        conv_id, auto_matched = await ensure_match(user["id"], req.target_id, reason="gift")
    if not conv_id:
        m = await db.matches.find_one({"users": {"$all": [user["id"], req.target_id]}})
        conv_id = m["id"] if m else None
    if conv_id:
        conv = await db.conversations.find_one({"id": conv_id})
        if conv and user["id"] in conv.get("users", []) and req.target_id in conv.get("users", []):
            label = f"{gift['icon']} 🪙 {gift['cost']}"
            await db.messages.insert_one({"id": str(uuid.uuid4()), "conversation_id": conv_id, "from_id": user["id"],
                                          "text": (req.message or "").strip(), "type": "gift", "gift_icon": gift["icon"], "gift_cost": gift["cost"], "tx_id": tx["id"], "created_at": now})
            await db.conversations.update_one({"id": conv_id}, {"$set": {"last_message": label, "last_at": now}})
    await notify(req.target_id, "gift", f"{gift['icon']} Gift from {user['name']}",
                 f"{user['name']} sent you {gift['icon']} worth {gift['cost']} coins" + (f": “{req.message.strip()}”" if (req.message or "").strip() else ""),
                 {"from_id": user["id"], "name": user["name"], "gift_icon": gift["icon"], "cost": gift["cost"], "conversation_id": conv_id, "auto_matched": auto_matched}, email=True)
    if auto_matched:
        await notify(req.target_id, "match", "It's a match! 💘", f"{user['name']} sent you a gift — you're now matched. Say hello!", {"conversation_id": conv_id, "user_id": user["id"], "name": user["name"]}, email=True)
        await notify(user["id"], "match", "It's a match! 💘", f"Your gift to {target['name']} opened a chat. Say hello!", {"conversation_id": conv_id, "user_id": req.target_id, "name": target["name"]}, email=True)
    return {"ok": True, "commission": commission, "net_to_recipient": net, "conversation_id": conv_id, "auto_matched": auto_matched}

class GiftThanksReq(BaseModel):
    message_id: str
    reaction: Optional[str] = "❤️"

@api.post("/gifts/thanks")
async def gift_thanks(req: GiftThanksReq, user=Depends(get_current_user)):
    m = await db.messages.find_one({"id": req.message_id, "type": "gift"})
    if not m or m["from_id"] == user["id"]: raise HTTPException(404, "Gift message not found")
    conv = await db.conversations.find_one({"id": m["conversation_id"]})
    if not conv or user["id"] not in conv["users"]: raise HTTPException(403, "No access")
    if m.get("thanks"): return {"ok": True, "already": True}
    reaction = (req.reaction or "❤️").strip()[:4] or "❤️"
    now = datetime.now(timezone.utc).isoformat()
    await db.messages.update_one({"id": m["id"]}, {"$set": {"thanks": reaction, "thanks_at": now}})
    await db.messages.insert_one({"id": str(uuid.uuid4()), "conversation_id": m["conversation_id"], "from_id": user["id"], "text": f"Thank you {reaction}", "type": "thanks", "reaction": reaction, "gift_message_id": m["id"], "created_at": now})
    await db.conversations.update_one({"id": m["conversation_id"]}, {"$set": {"last_message": f"Thank you {reaction}", "last_at": now}})
    await notify(m["from_id"], "gift_thanks", f"{user['name']} said thanks {reaction}", f"{user['name']} thanked you for your gift {m.get('gift_icon','')}", {"conversation_id": m["conversation_id"], "user_id": user["id"]})
    return {"ok": True}

@api.get("/gifts/received")
async def gifts_received(user=Depends(get_current_user)):
    return await db.transactions.find({"to_id": user["id"], "type": "gift"}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.get("/gifts/sent")
async def gifts_sent(user=Depends(get_current_user)):
    return await db.transactions.find({"from_id": user["id"], "type": "gift"}, {"_id": 0}).sort("created_at", -1).to_list(200)

# ---------- Video calls ----------
@api.post("/videocalls/start")
async def start_call(req: VideoCallReq, user=Depends(get_current_user)):
    target = await db.users.find_one({"id": req.target_id})
    if not target: raise HTTPException(404, "Recipient not found")
    rate = max(target.get("video_rate") or 0, (await get_settings())["video_rate"])
    cost = req.minutes * rate
    if user["coins"] < cost: raise HTTPException(400, "Insufficient coins")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": -cost}})
    net = cost
    await db.users.update_one({"id": req.target_id}, {"$inc": {"withdrawable": net}})
    call_id = str(uuid.uuid4())
    await db.transactions.insert_one({"id": call_id, "type": "videocall", "from_id": user["id"], "to_id": req.target_id, "minutes": req.minutes, "cost": cost, "rate": rate, "net": net, "created_at": now})
    return {"call_id": call_id, "cost": cost, "minutes": req.minutes, "rate": rate}

# ---------- Date bookings with escrow ----------
@api.post("/dates/book")
async def book_date(req: DateBookingReq, user=Depends(get_current_user)):
    min_coins = (await get_settings())["date_min_coins"]
    if req.coins < min_coins: raise HTTPException(400, f"Minimum {min_coins} coins")
    if user["coins"] < req.coins: raise HTTPException(400, "Insufficient coins")
    target = await db.users.find_one({"id": req.target_id})
    if not target: raise HTTPException(404, "Recipient not found")
    now = datetime.now(timezone.utc).isoformat()
    day = req.scheduled_at[:10]
    if target.get("availability") and day not in target["availability"]: raise HTTPException(400, "DAY_UNAVAILABLE")
    win = (target.get("availability_slots") or {}).get(day) or target.get("availability_time")
    if win:
        try:
            local_t = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00")).strftime("%H:%M") if req.local_time is None else req.local_time
        except Exception: local_t = req.local_time or "00:00"
        if not (win["from"] <= local_t <= win["to"]): raise HTTPException(400, f"TIME_UNAVAILABLE:{win['from']}-{win['to']}")
    if await db.date_bookings.find_one({"status": {"$in": ["escrow", "accepted", "confirmed"]}, "scheduled_at": {"$regex": f"^{day}"},
                                        "$or": [{"to_id": req.target_id}, {"from_id": req.target_id}]}):
        raise HTTPException(400, "DAY_BUSY")
    booking_id = str(uuid.uuid4())
    doc = {"id": booking_id, "from_id": user["id"], "to_id": req.target_id,
           "venue": req.venue, "city": req.city, "address": (req.address or "").strip(), "postal_code": (req.postal_code or "").strip(), "country": (req.country or "").strip(), "lat": req.lat, "lng": req.lng, "scheduled_at": req.scheduled_at,
           "coins": req.coins, "status": "escrow", "photo_url": None,
           "release_at": None, "created_at": now}
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": -req.coins}})
    # hold in escrow of recipient
    await db.users.update_one({"id": req.target_id}, {"$inc": {"escrow": req.coins}})
    await db.date_bookings.insert_one(doc)
    await notify(req.target_id, "date_request", "New date request 📅", f"{user['name']} invited you to {req.venue}, {req.city} · 🪙 {req.coins}. Accept or decline in Dates.", {"booking_id": booking_id}, email=True)
    return {"booking_id": booking_id, "status": "escrow"}

@api.post("/dates/respond/{bid}")
async def respond_date(bid: str, accept: bool, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": bid})
    if not b: raise HTTPException(404, "Not found")
    if b["to_id"] != user["id"]: raise HTTPException(403, "Only recipient can respond")
    if b["status"] != "escrow": raise HTTPException(400, "Cannot respond")
    now = datetime.now(timezone.utc).isoformat()
    if accept:
        await db.date_bookings.update_one({"id": bid}, {"$set": {"status": "accepted", "accepted_at": now}})
        await notify(b["from_id"], "date_accepted", "Date accepted 💃", f"{user['name']} accepted your date at {b['venue']}.", {"booking_id": bid}, email=True)
        return {"status": "accepted"}
    await db.users.update_one({"id": b["from_id"]}, {"$inc": {"coins": b["coins"]}})
    await db.users.update_one({"id": user["id"]}, {"$inc": {"escrow": -b["coins"]}})
    await db.date_bookings.update_one({"id": bid}, {"$set": {"status": "declined", "declined_at": now}})
    await notify(b["from_id"], "date_declined", "Date declined", f"{user['name']} declined your date at {b['venue']}. 🪙 {b['coins']} refunded.", {"booking_id": bid}, email=True)
    return {"status": "declined", "refunded": b["coins"]}

class LocationReq(BaseModel):
    venue: str
    city: str
    address: Optional[str] = ""
    postal_code: Optional[str] = ""
    country: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None

async def _split_cancel(b: dict, reason: str):
    pct = (await get_settings()).get("cancel_refund_pct", CANCEL_REFUND_PCT)
    refund = int(round(b["coins"] * pct)); kept = b["coins"] - refund
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": b["from_id"]}, {"$inc": {"coins": refund}})
    await db.users.update_one({"id": b["to_id"]}, {"$inc": {"escrow": -b["coins"], "withdrawable": kept}})
    await db.date_bookings.update_one({"id": b["id"]}, {"$set": {"status": "cancelled", "refund": refund, "compensation": kept, "cancelled_at": now, "cancel_reason": reason, "pending_location": None}})
    if kept:
        await db.transactions.insert_one({"id": str(uuid.uuid4()), "type": "date_cancel_fee", "from_id": b["from_id"], "to_id": b["to_id"], "cost": kept, "net": kept, "created_at": now})
    for uid in (b["from_id"], b["to_id"]):
        await notify(uid, "date_cancelled", "Date cancelled", f"Date at {b['venue']} was cancelled: {reason}. Refund 🪙 {refund} / compensation 🪙 {kept}.", {"booking_id": b["id"]}, email=True)

async def _expire_location_proposals(user_id: str):
    now_dt = datetime.now(timezone.utc)
    rows = await db.date_bookings.find({"status": {"$in": ["escrow", "accepted"]}, "pending_location": {"$ne": None}, "$or": [{"from_id": user_id}, {"to_id": user_id}]}).to_list(200)
    for b in rows:
        try: sched = datetime.fromisoformat(b["scheduled_at"].replace("Z", "+00:00"))
        except Exception: continue
        if now_dt >= sched.replace(hour=0, minute=0, second=0, microsecond=0):
            await _split_cancel(b, "address change was not approved before the meeting day")

@api.post("/dates/location/{bid}")
async def change_location(bid: str, req: LocationReq, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": bid})
    if not b: raise HTTPException(404, "Not found")
    if user["id"] not in (b["from_id"], b["to_id"]): raise HTTPException(403, "No access")
    if b["status"] not in ("escrow", "accepted"): raise HTTPException(400, "Cannot change location")
    if not req.venue.strip() or not req.city.strip(): raise HTTPException(400, "Venue and city required")
    now = datetime.now(timezone.utc).isoformat()
    other = b["to_id"] if user["id"] == b["from_id"] else b["from_id"]
    prop = {"venue": req.venue.strip(), "city": req.city.strip(), "address": (req.address or "").strip(), "postal_code": (req.postal_code or "").strip(), "country": (req.country or "").strip(), "lat": req.lat, "lng": req.lng, "proposed_by": user["id"], "proposed_at": now}
    await db.date_bookings.update_one({"id": bid}, {"$set": {"pending_location": prop}})
    await notify(other, "date_location", "New meeting address proposed 📍", f"{user['name']} proposes {prop['venue']}, {prop['address'] or prop['city']}. Approve it before the meeting day, otherwise the date is cancelled with a 50% refund.", {"booking_id": bid}, email=True)
    return {"status": b["status"], "pending_location": prop}

@api.post("/dates/location/{bid}/respond")
async def respond_location(bid: str, accept: bool, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": bid})
    if not b or not b.get("pending_location"): raise HTTPException(404, "No pending proposal")
    prop = b["pending_location"]
    if user["id"] not in (b["from_id"], b["to_id"]) or user["id"] == prop["proposed_by"]: raise HTTPException(403, "Only the other party can respond")
    now = datetime.now(timezone.utc).isoformat()
    if accept:
        await db.date_bookings.update_one({"id": bid}, {"$set": {"venue": prop["venue"], "city": prop["city"], "address": prop.get("address", ""), "postal_code": prop.get("postal_code", ""), "country": prop.get("country", ""), "lat": prop.get("lat"), "lng": prop.get("lng"),
            "location_changed_at": now, "original_venue": b.get("original_venue") or b["venue"], "original_city": b.get("original_city") or b["city"], "pending_location": None}})
        await notify(prop["proposed_by"], "date_location", "Address approved ✅", f"{user['name']} approved the new meeting place: {prop['venue']}.", {"booking_id": bid}, email=True)
        return {"status": "approved"}
    await db.date_bookings.update_one({"id": bid}, {"$set": {"pending_location": None}})
    await notify(prop["proposed_by"], "date_location", "Address declined", f"{user['name']} declined the new meeting place. The original address stays.", {"booking_id": bid}, email=True)
    return {"status": "declined"}

@api.get("/profiles/{pid}/availability")
async def profile_availability(pid: str, user=Depends(get_current_user)):
    p = await db.users.find_one({"id": pid}, {"_id": 0, "availability": 1, "availability_time": 1, "availability_slots": 1})
    if not p: raise HTTPException(404, "Not found")
    busy = await db.date_bookings.find({"status": {"$in": ["escrow", "accepted", "confirmed"]}, "$or": [{"to_id": pid}, {"from_id": pid}]}, {"_id": 0, "scheduled_at": 1}).to_list(500)
    return {"available_days": p.get("availability") or [], "busy_days": sorted({b["scheduled_at"][:10] for b in busy}),
            "time_window": p.get("availability_time"), "slots": p.get("availability_slots") or {}}

@api.get("/dates")
async def list_dates(user=Depends(get_current_user)):
    await _expire_location_proposals(user["id"])
    # trigger release for any past release_at
    now_dt = datetime.now(timezone.utc)
    to_release = await db.date_bookings.find({"to_id": user["id"], "status": "confirmed"}).to_list(200)
    for b in to_release:
        if b.get("release_at"):
            try: ra = datetime.fromisoformat(b["release_at"].replace("Z", "+00:00"))
            except Exception: continue
            if ra <= now_dt:
                await db.users.update_one({"id": user["id"]}, {"$inc": {"escrow": -b["coins"], "withdrawable": b["coins"]}})
                await db.date_bookings.update_one({"id": b["id"]}, {"$set": {"status": "released"}})
    outgoing = await db.date_bookings.find({"from_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    incoming = await db.date_bookings.find({"to_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"outgoing": outgoing, "incoming": incoming}

@api.post("/dates/confirm")
async def confirm_date(req: DateConfirmReq, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": req.booking_id})
    if not b: raise HTTPException(404, "Not found")
    if b["to_id"] != user["id"]: raise HTTPException(403, "Only recipient can confirm")
    if b["status"] not in ("escrow", "accepted"): raise HTTPException(400, "Cannot confirm")
    if b.get("pending_location"): raise HTTPException(400, "LOCATION_PENDING")
    now_dt = datetime.now(timezone.utc)
    try: sched = datetime.fromisoformat(b["scheduled_at"].replace("Z", "+00:00"))
    except Exception: sched = now_dt
    if sched.tzinfo is None: sched = sched.replace(tzinfo=timezone.utc)
    if now_dt < sched: raise HTTPException(400, "DATE_NOT_YET")
    release_at = max(sched + timedelta(days=1), now_dt).isoformat()
    await db.date_bookings.update_one({"id": req.booking_id}, {"$set": {"status": "confirmed", "photo_url": req.photo_url, "confirmed_at": datetime.now(timezone.utc).isoformat(), "release_at": release_at}})
    return {"status": "confirmed", "release_at": release_at}

@api.post("/dates/cancel/{bid}")
async def cancel_date(bid: str, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": bid})
    if not b: raise HTTPException(404, "Not found")
    if b["from_id"] != user["id"]: raise HTTPException(403, "Only booker can cancel")
    if b["status"] not in ("escrow", "accepted"): raise HTTPException(400, "Cannot cancel")
    pct = (await get_settings()).get("cancel_refund_pct", CANCEL_REFUND_PCT)
    refund = int(round(b["coins"] * pct))
    kept = b["coins"] - refund
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": refund}})
    await db.users.update_one({"id": b["to_id"]}, {"$inc": {"escrow": -b["coins"], "withdrawable": kept}})
    await db.date_bookings.update_one({"id": bid}, {"$set": {"status": "cancelled", "refund": refund, "compensation": kept, "cancelled_at": now}})
    if kept:
        await db.transactions.insert_one({"id": str(uuid.uuid4()), "type": "date_cancel_fee", "from_id": user["id"], "to_id": b["to_id"], "cost": kept, "net": kept, "created_at": now})
        await notify(b["to_id"], "date_cancelled", "Date cancelled", f"{user['name']} cancelled the date at {b['venue']}. You received 🪙 {kept} as compensation.", {"booking_id": bid}, email=True)
    return {"status": "cancelled", "refund": refund, "compensation": kept}

# ---------- Taxi gift for a date ----------
class TaxiRequestReq(BaseModel):
    coins: int

@api.post("/dates/taxi/request/{bid}")
async def request_taxi(bid: str, req: TaxiRequestReq, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": bid})
    if not b: raise HTTPException(404, "Not found")
    if b["to_id"] != user["id"]: raise HTTPException(403, "Only the invited person can request a taxi")
    if b["status"] not in ("escrow", "accepted", "confirmed"): raise HTTPException(400, "Cannot request taxi")
    if req.coins < 1: raise HTTPException(400, "Invalid amount")
    if (b.get("taxi") or {}).get("status") == "pending": raise HTTPException(400, "TAXI_PENDING")
    now = datetime.now(timezone.utc).isoformat()
    taxi = {"coins": int(req.coins), "status": "pending", "requested_at": now}
    await db.date_bookings.update_one({"id": bid}, {"$set": {"taxi": taxi}})
    await notify(b["from_id"], "date_taxi", "Taxi requested 🚕", f"{user['name']} asks for 🪙 {req.coins} for a taxi to your date at {b['venue']}. Send it in Dates.", {"booking_id": bid, "coins": req.coins}, email=True)
    return {"ok": True, "taxi": taxi}

@api.post("/dates/taxi/send/{bid}")
async def send_taxi(bid: str, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": bid})
    if not b: raise HTTPException(404, "Not found")
    if b["from_id"] != user["id"]: raise HTTPException(403, "Only the booker can send a taxi")
    if b["status"] not in ("escrow", "accepted", "confirmed"): raise HTTPException(400, "Cannot send taxi")
    taxi = b.get("taxi")
    if not taxi or taxi.get("status") != "pending": raise HTTPException(400, "No pending taxi request")
    coins = int(taxi["coins"])
    if user["coins"] < coins: raise HTTPException(400, "Insufficient coins")
    now = datetime.now(timezone.utc).isoformat()
    commission = round(coins * (await get_settings())["commission"], 2)
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": -coins}})
    await db.users.update_one({"id": b["to_id"]}, {"$inc": {"withdrawable": coins}})
    await db.transactions.insert_one({"id": str(uuid.uuid4()), "type": "gift", "from_id": user["id"], "to_id": b["to_id"],
                                      "gift_id": "taxi", "gift_icon": "🚕", "cost": coins, "commission": commission, "net": coins, "message": "Taxi", "created_at": now})
    await db.date_bookings.update_one({"id": bid}, {"$set": {"taxi.status": "sent", "taxi.sent_at": now}})
    await notify(b["to_id"], "date_taxi", "🚕 Taxi received", f"{user['name']} sent you 🪙 {coins} for a taxi to your date at {b['venue']}.", {"booking_id": bid, "coins": coins}, email=True)
    return {"ok": True, "coins": coins}

@api.post("/dates/taxi/decline/{bid}")
async def decline_taxi(bid: str, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": bid})
    if not b: raise HTTPException(404, "Not found")
    if b["from_id"] != user["id"]: raise HTTPException(403, "Only the booker can decline")
    taxi = b.get("taxi")
    if not taxi or taxi.get("status") != "pending": raise HTTPException(400, "No pending taxi request")
    now = datetime.now(timezone.utc).isoformat()
    await db.date_bookings.update_one({"id": bid}, {"$set": {"taxi.status": "declined", "taxi.declined_at": now}})
    await notify(b["to_id"], "date_taxi", "Taxi request declined", f"{user['name']} declined your taxi request for the date at {b['venue']}.", {"booking_id": bid})
    return {"ok": True}

# ---------- Wallet / Withdraw ----------
@api.get("/wallet")
async def wallet(user=Depends(get_current_user)):
    txs = await db.transactions.find({"$or": [{"from_id": user["id"]}, {"to_id": user["id"]}]}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    withdrawals = await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    acct = await db.payout_accounts.find_one({"user_id": user["id"]}, {"_id": 0})
    s = await get_settings()
    return {"coins": user["coins"], "escrow": user.get("escrow", 0), "withdrawable": user.get("withdrawable", 0),
            "transactions": txs, "withdrawals": withdrawals, "payout_account": acct, "withdraw_commission": s["commission"], "coins_per_usd": s["coins_per_usd"], "min_withdraw_usd": s["min_withdraw_usd"], "is_admin": is_admin(user)}

@api.get("/wallet/payout-account")
async def get_payout_account(user=Depends(get_current_user)):
    return await db.payout_accounts.find_one({"user_id": user["id"]}, {"_id": 0})

@api.post("/wallet/payout-account")
async def submit_payout_account(req: PayoutAccountReq, user=Depends(get_current_user)):
    iban = req.iban.replace(" ", "").upper()
    if len(iban) < 8: raise HTTPException(400, "Invalid account number")
    data = {k: (v.strip() if isinstance(v, str) else v) for k, v in req.model_dump().items()}
    required = [k for k in data if k not in ("routing_number", "document_path")]
    missing = [k for k in required if not data[k]]
    if missing: raise HTTPException(400, f"Missing: {', '.join(missing)}")
    if "@" not in data["recipient_email"]: raise HTTPException(400, "Invalid recipient email")
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "user_name": user["name"], "user_email": user["email"],
           **data, "iban": iban, "status": "pending", "reason": "",
           "submitted_at": datetime.now(timezone.utc).isoformat(), "verified_at": None}
    await db.payout_accounts.replace_one({"user_id": user["id"]}, doc, upsert=True)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.post("/wallet/withdraw")
async def withdraw(req: WithdrawReq, user=Depends(get_current_user)):
    # withdrawable is in coins; coins_per_usd (default 10 coins = $1); commission withheld here
    if req.amount <= 0: raise HTTPException(400, "Invalid amount")
    if user.get("withdrawable", 0) < req.amount: raise HTTPException(400, "Insufficient withdrawable balance")
    acct = await db.payout_accounts.find_one({"user_id": user["id"]})
    if not acct or acct["status"] != "verified": raise HTTPException(400, "Bank account not verified")
    s = await get_settings()
    fee = round(req.amount * s["commission"], 2)
    net = round(req.amount - fee, 2)
    usd = round(net / s["coins_per_usd"], 2)
    if usd < s["min_withdraw_usd"]: raise HTTPException(400, f"MIN_WITHDRAW:{s['min_withdraw_usd']}")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$inc": {"withdrawable": -req.amount}})
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "amount": req.amount, "fee": fee, "net": net, "usd": usd, "rate": s["coins_per_usd"],
           "method": "bank", "destination": f"{acct['bank_name']} ····{acct['iban'][-4:]}", "status": "pending", "created_at": now}
    await db.withdrawals.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

# ---------- Admin ----------
class GiftItem(BaseModel):
    id: str
    name_key: str
    icon: str
    cost: int

class CoinPackageItem(BaseModel):
    id: str
    coins: int
    amount: float
    bonus: int = 0
    name: str

class SettingsReq(BaseModel):
    gifts: List[GiftItem]
    coin_packages: List[CoinPackageItem]
    premium_amount: float
    video_rate: int
    date_min_coins: int
    referral_bonus: int
    commission: float
    free_daily_likes: int = FREE_DAILY_LIKES
    custom_coins_per_usd: int = CUSTOM_COINS_PER_USD
    custom_bonus_pct: float = CUSTOM_BONUS_PCT
    custom_min_usd: float = CUSTOM_MIN_USD
    coins_per_usd: int = COINS_PER_USD
    min_withdraw_usd: float = MIN_WITHDRAW_USD
    referral_package_id: Optional[str] = "popular"
    cancel_refund_pct: float = CANCEL_REFUND_PCT
    gift_auto_match_coins: int = 100

@api.get("/admin/settings")
async def admin_get_settings(admin=Depends(get_admin)):
    return await get_settings()

@api.put("/admin/settings")
async def admin_put_settings(req: SettingsReq, admin=Depends(get_admin)):
    if not (0 <= req.commission < 1): raise HTTPException(400, "Commission must be 0–0.99")
    if any(g.cost <= 0 for g in req.gifts) or any(p.amount <= 0 or p.coins <= 0 for p in req.coin_packages): raise HTTPException(400, "Values must be positive")
    doc = {"id": "pricing", **req.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin["id"]}
    await db.settings.replace_one({"id": "pricing"}, doc, upsert=True)
    return await get_settings()

@api.get("/admin/payout-accounts")
async def admin_payout_accounts(status: str = "pending", admin=Depends(get_admin)):
    q = {} if status == "all" else {"status": status}
    return await db.payout_accounts.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(200)

@api.post("/admin/payout-accounts/{user_id}/verify")
async def admin_verify_account(user_id: str, req: AdminVerifyReq, admin=Depends(get_admin)):
    acct = await db.payout_accounts.find_one({"user_id": user_id})
    if not acct: raise HTTPException(404, "Not found")
    status = "verified" if req.approve else "rejected"
    await db.payout_accounts.update_one({"user_id": user_id}, {"$set": {"status": status, "reason": req.reason or "", "verified_at": datetime.now(timezone.utc).isoformat(), "verified_by": admin["id"]}})
    await notify(user_id, "payout_account", "Bank account verified ✅" if req.approve else "Bank account rejected",
                 "You can now withdraw your earnings." if req.approve else (req.reason or "Please re-submit your bank details."), email=True)
    return {"status": status}

@api.get("/admin/withdrawals")
async def admin_withdrawals(admin=Depends(get_admin)):
    return await db.withdrawals.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/admin/withdrawals/{wid}/{action}")
async def admin_withdrawal_action(wid: str, action: str, admin=Depends(get_admin)):
    if action not in ("paid", "rejected"): raise HTTPException(400, "Bad action")
    w = await db.withdrawals.find_one({"id": wid})
    if not w or w["status"] != "pending": raise HTTPException(400, "Not pending")
    if action == "rejected":
        await db.users.update_one({"id": w["user_id"]}, {"$inc": {"withdrawable": w["amount"]}})
    await db.withdrawals.update_one({"id": wid}, {"$set": {"status": action, "processed_at": datetime.now(timezone.utc).isoformat()}})
    await notify(w["user_id"], "withdrawal", f"Withdrawal {action}", f"${w['usd']} → {w['destination']}", email=True)
    return {"status": action}

# ---------- Stripe checkout ----------
@api.post("/payments/checkout")
async def create_checkout(req: CheckoutReq, user=Depends(get_current_user)):
    s = await get_settings()
    if req.package_id == "premium_monthly":
        pkg_name = PREMIUM_PACKAGE["name"]; amount = int(round(s["premium_amount"] * 100)); mode = "payment"
        metadata = {"user_id": user["id"], "package_id": "premium_monthly", "type": "premium"}
    elif req.package_id == "custom":
        usd = round(float(req.usd_amount or 0), 2)
        if usd < s["custom_min_usd"]: raise HTTPException(400, f"Minimum ${s['custom_min_usd']}")
        base = int(usd * s["custom_coins_per_usd"])
        bonus = int(base * s["custom_bonus_pct"] / 100)
        pkg_name = f"Custom {base} coins (+{bonus} bonus)"; amount = int(round(usd * 100)); mode = "payment"
        metadata = {"user_id": user["id"], "package_id": "custom", "type": "coins", "coins": str(base + bonus)}
    else:
        pkg = next((p for p in s["coin_packages"] if p["id"] == req.package_id), None)
        if not pkg: raise HTTPException(400, "Unknown package")
        pkg_name = pkg["name"]; amount = int(round(pkg["amount"] * 100)); mode = "payment"
        metadata = {"user_id": user["id"], "package_id": req.package_id, "type": "coins", "coins": str(pkg["coins"] + pkg["bonus"])}
    try:
        session = stripe.checkout.Session.create(
            line_items=[{"price_data": {"currency": "usd", "product_data": {"name": pkg_name}, "unit_amount": amount}, "quantity": 1}],
            mode=mode,
            # Omitting payment_method_types lets Stripe show every method enabled in the Dashboard for the buyer's country:
            # all major cards worldwide, Apple Pay / Google Pay, Link, PayPal, Klarna, iDEAL, SEPA, Alipay, WeChat Pay, etc.
            billing_address_collection="auto",
            customer_email=user.get("email"),
            locale="auto",
            success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{req.origin_url}/payment/cancel",
            metadata=metadata,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(500, f"Stripe error: {e.user_message or str(e)}")
    await db.payment_transactions.insert_one({
        "session_id": session.id, "user_id": user["id"], "package_id": req.package_id,
        "amount": amount / 100, "currency": "usd", "status": "initiated",
        "payment_status": "pending", "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"checkout_url": session.url, "session_id": session.id}

async def _fulfill(session_id: str, meta: dict):
    """Idempotent — grants coins/premium once."""
    rec = await db.payment_transactions.find_one({"session_id": session_id})
    if not rec or rec.get("fulfilled"):
        return
    user_id = meta.get("user_id") or rec.get("user_id")
    if meta.get("type") == "coins":
        coins = int(meta.get("coins", 0))
        await db.users.update_one({"id": user_id}, {"$inc": {"coins": coins}})
        req_pkg = (await get_settings()).get("referral_package_id")
        if not req_pkg or meta.get("package_id") == req_pkg:
            await _reward_referrer(user_id)
    elif meta.get("type") == "premium":
        u = await db.users.find_one({"id": user_id})
        start = datetime.now(timezone.utc)
        cur = u.get("premium_until")
        if cur:
            try:
                cur_dt = datetime.fromisoformat(cur.replace("Z", "+00:00"))
                if cur_dt > start: start = cur_dt
            except Exception: pass
        new_until = (start + timedelta(days=30)).isoformat()
        await db.users.update_one({"id": user_id}, {"$set": {"premium_until": new_until}})
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"fulfilled": True}})

@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not rec: raise HTTPException(404, "Transaction not found")
    if rec.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
                await _fulfill(session_id, rec.get("metadata") or {})
                rec = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError:
            pass
    return {"session_id": rec["session_id"], "status": rec["status"], "payment_status": rec["payment_status"]}

@api.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(400, "Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await _fulfill(obj["id"], obj.get("metadata") or {})
    return {"status": "ok"}

# ---------- Health ----------
@api.get("/")
async def root():
    return {"service": "GiftsDates", "ok": True}

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
