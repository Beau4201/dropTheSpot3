from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Union
import uuid
from datetime import datetime, timezone
import jwt
from passlib.context import CryptContext
import secrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Security
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 1 week

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# User Models
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: EmailStr
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    spots_count: int = Field(default=0)
    friends: List[str] = Field(default_factory=list)  # List of user IDs
    groups: List[str] = Field(default_factory=list)   # List of group IDs

class UserProfile(BaseModel):
    id: str
    username: str
    email: EmailStr
    created_at: datetime
    spots_count: int
    friends_count: int = 0
    average_rating: float = 0.0

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserProfile

# Enhanced Spot Models
class SpotCreate(BaseModel):
    title: str
    description: str
    photo: str  # base64 encoded image
    latitude: float
    longitude: float

class SpotRating(BaseModel):
    user_id: str
    spot_id: str
    rating: int = Field(ge=1, le=5)  # 1-5 stars

class Spot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    photo: str
    latitude: float
    longitude: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str
    username: str
    average_rating: float = Field(default=0.0)
    rating_count: int = Field(default=0)
    is_public: bool = Field(default=True)

# Group Models
class GroupCreate(BaseModel):
    name: str
    description: str
    is_private: bool = Field(default=False)

class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    creator_id: str
    members: List[str] = Field(default_factory=list)  # List of user IDs
    is_private: bool = Field(default=False)

# Friend Request Models
class FriendRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_user_id: str
    to_user_id: str
    status: str = Field(default="pending")  # pending, accepted, rejected
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Helper functions for MongoDB serialization
def prepare_for_mongo(data):
    """Prepare data for MongoDB storage"""
    if isinstance(data, dict):
        if 'created_at' in data and isinstance(data['created_at'], datetime):
            data['created_at'] = data['created_at'].isoformat()
    return data

def parse_from_mongo(item):
    """Parse data from MongoDB"""
    if isinstance(item, dict):
        if 'created_at' in item and isinstance(item['created_at'], str):
            item['created_at'] = datetime.fromisoformat(item['created_at'])
        # Remove MongoDB's _id field
        item.pop('_id', None)
    return item

# Authentication helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc).timestamp() + (ACCESS_TOKEN_EXPIRE_HOURS * 3600)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    
    user_data = await db.users.find_one({"id": user_id})
    if user_data is None:
        raise credentials_exception
    
    parsed_user = parse_from_mongo(user_data)
    return User(**parsed_user)

async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user but don't fail if not authenticated (for public endpoints)"""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Drop the Spot API"}

# Authentication Routes
@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    """Register a new user"""
    try:
        # Check if username or email already exists
        existing_user = await db.users.find_one({
            "$or": [{"username": user_data.username}, {"email": user_data.email}]
        })
        if existing_user:
            raise HTTPException(status_code=400, detail="Username or email already registered")
        
        # Create new user
        hashed_password = hash_password(user_data.password)
        user = User(
            username=user_data.username,
            email=user_data.email
        )
        
        user_dict = prepare_for_mongo(user.dict())
        user_dict["password"] = hashed_password
        
        result = await db.users.insert_one(user_dict)
        if not result.inserted_id:
            raise HTTPException(status_code=500, detail="Failed to create user")
        
        # Create access token
        access_token = create_access_token(data={"sub": user.id})
        
        # Return user profile
        user_profile = UserProfile(
            id=user.id,
            username=user.username,
            email=user.email,
            created_at=user.created_at,
            spots_count=0
        )
        
        return Token(access_token=access_token, token_type="bearer", user=user_profile)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error registering user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.post("/auth/login", response_model=Token)
async def login(user_credentials: UserLogin):
    """Login user"""
    try:
        # Find user by username
        user_data = await db.users.find_one({"username": user_credentials.username})
        if not user_data or not verify_password(user_credentials.password, user_data["password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password"
            )
        
        parsed_user = parse_from_mongo(user_data)
        user = User(**parsed_user)
        
        # Get user stats
        spots_count = await db.spots.count_documents({"user_id": user.id})
        friends_count = len(user.friends)
        
        # Calculate average rating for user's spots
        pipeline = [
            {"$match": {"spot_id": {"$in": []}}},  # Will be filled with user's spot IDs
            {"$group": {"_id": None, "avg_rating": {"$avg": "$rating"}}}
        ]
        
        user_spots = await db.spots.find({"user_id": user.id}).to_list(length=None)
        spot_ids = [spot["id"] for spot in user_spots]
        
        avg_rating = 0.0
        if spot_ids:
            pipeline[0]["$match"]["spot_id"]["$in"] = spot_ids
            rating_result = await db.ratings.aggregate(pipeline).to_list(length=1)
            if rating_result:
                avg_rating = rating_result[0]["avg_rating"] or 0.0
        
        # Create access token
        access_token = create_access_token(data={"sub": user.id})
        
        # Return user profile
        user_profile = UserProfile(
            id=user.id,
            username=user.username,
            email=user.email,
            created_at=user.created_at,
            spots_count=spots_count,
            friends_count=friends_count,
            average_rating=round(avg_rating, 1)
        )
        
        return Token(access_token=access_token, token_type="bearer", user=user_profile)
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error logging in user: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.get("/auth/me", response_model=UserProfile)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    try:
        # Get updated stats
        spots_count = await db.spots.count_documents({"user_id": current_user.id})
        friends_count = len(current_user.friends)
        
        # Calculate average rating
        user_spots = await db.spots.find({"user_id": current_user.id}).to_list(length=None)
        spot_ids = [spot["id"] for spot in user_spots]
        
        avg_rating = 0.0
        if spot_ids:
            pipeline = [
                {"$match": {"spot_id": {"$in": spot_ids}}},
                {"$group": {"_id": None, "avg_rating": {"$avg": "$rating"}}}
            ]
            rating_result = await db.ratings.aggregate(pipeline).to_list(length=1)
            if rating_result:
                avg_rating = rating_result[0]["avg_rating"] or 0.0
        
        return UserProfile(
            id=current_user.id,
            username=current_user.username,
            email=current_user.email,
            created_at=current_user.created_at,
            spots_count=spots_count,
            friends_count=friends_count,
            average_rating=round(avg_rating, 1)
        )
    except Exception as e:
        logging.error(f"Error getting user profile: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.post("/spots", response_model=Spot)
async def create_spot(spot_data: SpotCreate):
    """Create a new spot"""
    try:
        spot = Spot(**spot_data.dict())
        spot_dict = prepare_for_mongo(spot.dict())
        
        result = await db.spots.insert_one(spot_dict)
        if result.inserted_id:
            return spot
        else:
            raise HTTPException(status_code=500, detail="Failed to create spot")
    except Exception as e:
        logging.error(f"Error creating spot: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.get("/spots", response_model=List[Spot])
async def get_all_spots():
    """Get all spots"""
    try:
        spots_data = await db.spots.find().to_list(length=None)
        spots = []
        for spot_data in spots_data:
            parsed_spot = parse_from_mongo(spot_data)
            spots.append(Spot(**parsed_spot))
        return spots
    except Exception as e:
        logging.error(f"Error fetching spots: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.get("/spots/{spot_id}", response_model=Spot)
async def get_spot(spot_id: str):
    """Get a specific spot by ID"""
    try:
        spot_data = await db.spots.find_one({"id": spot_id})
        if not spot_data:
            raise HTTPException(status_code=404, detail="Spot not found")
        
        parsed_spot = parse_from_mongo(spot_data)
        return Spot(**parsed_spot)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching spot {spot_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.delete("/spots/{spot_id}")
async def delete_spot(spot_id: str):
    """Delete a spot"""
    try:
        result = await db.spots.delete_one({"id": spot_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Spot not found")
        return {"message": "Spot deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting spot {spot_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()