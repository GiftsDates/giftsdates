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
import os, uuid, logging, bcrypt, jwt, stripe, requests

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
    "coins_100":  {"coins": 100,  "amount": 9.99,   "bonus": 0,   "name": "Starter Pack"},
    "coins_500":  {"coins": 500,  "amount": 44.99,  "bonus": 50,  "name": "Popular Pack"},
    "coins_2000": {"coins": 2000, "amount": 149.99, "bonus": 300, "name": "VIP Pack"},
}
PREMIUM_PACKAGE = {"lookup": "premium_monthly", "amount": 29.99, "name": "GiftsDates Premium Monthly"}
GIFT_CATALOG = [
    {"id": "rose",       "name_key": "gift_rose",       "icon": "🌹", "cost": 50},
    {"id": "chocolate",  "name_key": "gift_chocolate",  "icon": "🍫", "cost": 100},
    {"id": "champagne",  "name_key": "gift_champagne",  "icon": "🍾", "cost": 250},
    {"id": "perfume",    "name_key": "gift_perfume",    "icon": "💐", "cost": 500},
    {"id": "watch",      "name_key": "gift_watch",      "icon": "⌚", "cost": 1000},
    {"id": "ring",       "name_key": "gift_ring",       "icon": "💍", "cost": 5000},
]
GIFT_COMMISSION = 0.30
VIDEO_RATE_PER_MIN = 10
DATE_MIN_COINS = 500

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
    return user

# ---------- Models ----------
class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    name: str
    age: int
    gender: str
    interested_in: str
    city: str
    country: str
    bio: Optional[str] = ""

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

class LikeReq(BaseModel):
    target_id: str

class GiftReq(BaseModel):
    target_id: str
    gift_id: str
    message: Optional[str] = ""

class VideoCallReq(BaseModel):
    target_id: str
    minutes: int

class DateBookingReq(BaseModel):
    target_id: str
    venue: str
    city: str
    scheduled_at: str  # ISO
    coins: int

class DateConfirmReq(BaseModel):
    booking_id: str
    photo_url: str

class WithdrawReq(BaseModel):
    amount: float
    method: str  # bank/card/crypto
    destination: str

class CheckoutReq(BaseModel):
    package_id: str  # coin package id or "premium_monthly"
    origin_url: str

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
    logging.info("GiftsDates backend ready")

# ---------- Meta ----------
@api.get("/meta")
async def meta():
    return {
        "gifts": GIFT_CATALOG,
        "coin_packages": [{"id": k, **v} for k, v in COIN_PACKAGES.items()],
        "premium": PREMIUM_PACKAGE,
        "video_rate": VIDEO_RATE_PER_MIN,
        "gift_commission": GIFT_COMMISSION,
        "date_min_coins": DATE_MIN_COINS,
    }

# ---------- Auth ----------
@api.post("/auth/register")
async def register(req: RegisterReq):
    if await db.users.find_one({"email": req.email.lower()}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid, "email": req.email.lower(), "password": hash_pwd(req.password),
        "name": req.name, "age": req.age, "gender": req.gender,
        "interested_in": req.interested_in, "city": req.city, "country": req.country,
        "bio": req.bio or "", "interests": [], "photos": [], "language": "en",
        "coins": 100,  # welcome bonus
        "escrow": 0.0, "withdrawable": 0.0,
        "premium_until": None, "verified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"token": make_token(uid), "user": {k: v for k, v in doc.items() if k not in ("password", "_id")}}

@api.post("/auth/login")
async def login(req: LoginReq):
    u = await db.users.find_one({"email": req.email.lower()})
    if not u or not verify_pwd(req.password, u["password"]):
        raise HTTPException(401, "Invalid credentials")
    return {"token": make_token(u["id"]), "user": {k: v for k, v in u.items() if k not in ("password", "_id")}}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

@api.patch("/auth/me")
async def update_me(patch: ProfileUpdate, user=Depends(get_current_user)):
    upd = {k: v for k, v in patch.model_dump().items() if v is not None}
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

@api.get("/files/{path:path}")
async def download(path: str, authorization: Optional[str] = Header(None), auth: Optional[str] = None):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(404, "Not found")
    data, ct = get_object(path)
    return Response(content=data, media_type=rec.get("content_type") or ct)

# ---------- Profiles / Search ----------
@api.get("/profiles")
async def list_profiles(
    q: Optional[str] = None, city: Optional[str] = None, country: Optional[str] = None,
    min_age: int = 18, max_age: int = 99, gender: Optional[str] = None,
    limit: int = 40, user=Depends(get_current_user)
):
    query = {"id": {"$ne": user["id"]}, "age": {"$gte": min_age, "$lte": max_age}}
    if city: query["city"] = {"$regex": city, "$options": "i"}
    if country: query["country"] = {"$regex": country, "$options": "i"}
    if gender and gender != "all": query["gender"] = gender
    if q: query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"bio": {"$regex": q, "$options": "i"}}]
    cursor = db.users.find(query, {"_id": 0, "password": 0, "email": 0}).limit(limit)
    return await cursor.to_list(limit)

@api.get("/profiles/{pid}")
async def profile_detail(pid: str, user=Depends(get_current_user)):
    p = await db.users.find_one({"id": pid}, {"_id": 0, "password": 0, "email": 0})
    if not p: raise HTTPException(404, "Not found")
    return p

# ---------- Likes / Matches ----------
@api.post("/likes")
async def like(req: LikeReq, user=Depends(get_current_user)):
    if req.target_id == user["id"]: raise HTTPException(400, "Cannot like yourself")
    now = datetime.now(timezone.utc).isoformat()
    try:
        await db.likes.insert_one({"from_id": user["id"], "to_id": req.target_id, "created_at": now})
    except Exception:
        pass
    reverse = await db.likes.find_one({"from_id": req.target_id, "to_id": user["id"]})
    matched = False
    if reverse:
        matched = True
        exists = await db.matches.find_one({"users": {"$all": [user["id"], req.target_id]}})
        if not exists:
            conv_id = str(uuid.uuid4())
            await db.matches.insert_one({"id": conv_id, "users": [user["id"], req.target_id], "created_at": now})
            await db.conversations.insert_one({"id": conv_id, "users": [user["id"], req.target_id], "created_at": now, "last_message": None})
    return {"liked": True, "matched": matched}

@api.get("/matches")
async def my_matches(user=Depends(get_current_user)):
    matches = await db.matches.find({"users": user["id"]}, {"_id": 0}).to_list(200)
    result = []
    for m in matches:
        other_id = [u for u in m["users"] if u != user["id"]][0]
        other = await db.users.find_one({"id": other_id}, {"_id": 0, "password": 0, "email": 0})
        if other: result.append({"conversation_id": m["id"], "user": other, "created_at": m["created_at"]})
    return result

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
    msg = {"id": str(uuid.uuid4()), "conversation_id": req.conversation_id, "from_id": user["id"], "text": req.text, "created_at": now, "type": "text"}
    await db.messages.insert_one(dict(msg))
    await db.conversations.update_one({"id": req.conversation_id}, {"$set": {"last_message": req.text, "last_at": now}})
    return msg

# ---------- Gifts ----------
def _find_gift(gid):
    return next((g for g in GIFT_CATALOG if g["id"] == gid), None)

@api.post("/gifts/send")
async def send_gift(req: GiftReq, user=Depends(get_current_user)):
    gift = _find_gift(req.gift_id)
    if not gift: raise HTTPException(400, "Unknown gift")
    if user["coins"] < gift["cost"]: raise HTTPException(400, "Insufficient coins")
    target = await db.users.find_one({"id": req.target_id})
    if not target: raise HTTPException(404, "Recipient not found")
    net = round(gift["cost"] * (1 - GIFT_COMMISSION), 2)
    commission = round(gift["cost"] * GIFT_COMMISSION, 2)
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": -gift["cost"]}})
    # 70% goes to withdrawable (as coin value equivalent, treated as $ balance -> coins/100 usd)
    # Simpler model: withdrawable expressed in coins; conversion to USD at withdrawal (100 coins = $1)
    await db.users.update_one({"id": req.target_id}, {"$inc": {"withdrawable": net}})
    tx = {"id": str(uuid.uuid4()), "type": "gift", "from_id": user["id"], "to_id": req.target_id,
          "gift_id": gift["id"], "gift_icon": gift["icon"], "cost": gift["cost"],
          "commission": commission, "net": net, "message": req.message, "created_at": now}
    await db.transactions.insert_one(tx)
    return {"ok": True, "commission": commission, "net_to_recipient": net}

@api.get("/gifts/received")
async def gifts_received(user=Depends(get_current_user)):
    return await db.transactions.find({"to_id": user["id"], "type": "gift"}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.get("/gifts/sent")
async def gifts_sent(user=Depends(get_current_user)):
    return await db.transactions.find({"from_id": user["id"], "type": "gift"}, {"_id": 0}).sort("created_at", -1).to_list(200)

# ---------- Video calls ----------
@api.post("/videocalls/start")
async def start_call(req: VideoCallReq, user=Depends(get_current_user)):
    cost = req.minutes * VIDEO_RATE_PER_MIN
    if user["coins"] < cost: raise HTTPException(400, "Insufficient coins")
    target = await db.users.find_one({"id": req.target_id})
    if not target: raise HTTPException(404, "Recipient not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": -cost}})
    net = round(cost * (1 - GIFT_COMMISSION), 2)
    await db.users.update_one({"id": req.target_id}, {"$inc": {"withdrawable": net}})
    call_id = str(uuid.uuid4())
    await db.transactions.insert_one({"id": call_id, "type": "videocall", "from_id": user["id"], "to_id": req.target_id, "minutes": req.minutes, "cost": cost, "net": net, "created_at": now})
    return {"call_id": call_id, "cost": cost, "minutes": req.minutes}

# ---------- Date bookings with escrow ----------
@api.post("/dates/book")
async def book_date(req: DateBookingReq, user=Depends(get_current_user)):
    if req.coins < DATE_MIN_COINS: raise HTTPException(400, f"Minimum {DATE_MIN_COINS} coins")
    if user["coins"] < req.coins: raise HTTPException(400, "Insufficient coins")
    target = await db.users.find_one({"id": req.target_id})
    if not target: raise HTTPException(404, "Recipient not found")
    now = datetime.now(timezone.utc).isoformat()
    booking_id = str(uuid.uuid4())
    doc = {"id": booking_id, "from_id": user["id"], "to_id": req.target_id,
           "venue": req.venue, "city": req.city, "scheduled_at": req.scheduled_at,
           "coins": req.coins, "status": "escrow", "photo_url": None,
           "release_at": None, "created_at": now}
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": -req.coins}})
    # hold in escrow of recipient
    await db.users.update_one({"id": req.target_id}, {"$inc": {"escrow": req.coins}})
    await db.date_bookings.insert_one(doc)
    return {"booking_id": booking_id, "status": "escrow"}

@api.get("/dates")
async def list_dates(user=Depends(get_current_user)):
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
    if b["status"] != "escrow": raise HTTPException(400, "Cannot confirm")
    release_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    await db.date_bookings.update_one({"id": req.booking_id}, {"$set": {"status": "confirmed", "photo_url": req.photo_url, "confirmed_at": datetime.now(timezone.utc).isoformat(), "release_at": release_at}})
    return {"status": "confirmed", "release_at": release_at}

@api.post("/dates/cancel/{bid}")
async def cancel_date(bid: str, user=Depends(get_current_user)):
    b = await db.date_bookings.find_one({"id": bid})
    if not b: raise HTTPException(404, "Not found")
    if b["from_id"] != user["id"]: raise HTTPException(403, "Only booker can cancel")
    if b["status"] != "escrow": raise HTTPException(400, "Cannot cancel")
    await db.users.update_one({"id": user["id"]}, {"$inc": {"coins": b["coins"]}})
    await db.users.update_one({"id": b["to_id"]}, {"$inc": {"escrow": -b["coins"]}})
    await db.date_bookings.update_one({"id": bid}, {"$set": {"status": "cancelled"}})
    return {"status": "cancelled"}

# ---------- Wallet / Withdraw ----------
@api.get("/wallet")
async def wallet(user=Depends(get_current_user)):
    txs = await db.transactions.find({"$or": [{"from_id": user["id"]}, {"to_id": user["id"]}]}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    withdrawals = await db.withdrawals.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"coins": user["coins"], "escrow": user.get("escrow", 0), "withdrawable": user.get("withdrawable", 0), "transactions": txs, "withdrawals": withdrawals}

@api.post("/wallet/withdraw")
async def withdraw(req: WithdrawReq, user=Depends(get_current_user)):
    # withdrawable is in coins; 100 coins = $1
    if req.amount <= 0: raise HTTPException(400, "Invalid amount")
    if user.get("withdrawable", 0) < req.amount: raise HTTPException(400, "Insufficient withdrawable balance")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$inc": {"withdrawable": -req.amount}})
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "amount": req.amount, "usd": round(req.amount / 100, 2),
           "method": req.method, "destination": req.destination, "status": "pending", "created_at": now}
    await db.withdrawals.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

# ---------- Stripe checkout ----------
@api.post("/payments/checkout")
async def create_checkout(req: CheckoutReq, user=Depends(get_current_user)):
    if req.package_id == "premium_monthly":
        pkg_name = PREMIUM_PACKAGE["name"]; amount = int(PREMIUM_PACKAGE["amount"] * 100); mode = "payment"
        metadata = {"user_id": user["id"], "package_id": "premium_monthly", "type": "premium"}
    else:
        pkg = COIN_PACKAGES.get(req.package_id)
        if not pkg: raise HTTPException(400, "Unknown package")
        pkg_name = pkg["name"]; amount = int(pkg["amount"] * 100); mode = "payment"
        metadata = {"user_id": user["id"], "package_id": req.package_id, "type": "coins", "coins": str(pkg["coins"] + pkg["bonus"])}
    try:
        session = stripe.checkout.Session.create(
            line_items=[{"price_data": {"currency": "usd", "product_data": {"name": pkg_name}, "unit_amount": amount}, "quantity": 1}],
            mode=mode,
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
