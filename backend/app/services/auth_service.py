"""
auth_service.py — JWT validation for Supabase-issued tokens.

After migration to Supabase Auth:
  - Supabase issues JWTs signed with the project's JWT Secret (HS256).
  - The backend validates them locally using SUPABASE_JWT_SECRET.
  - No DB round-trip per request — fully stateless.

Supabase JWT claims
-------------------
  sub    : user UUID  (str)
  email  : user email (str)
  role   : "authenticated"
  aud    : "authenticated"
  iss    : "https://<project>.supabase.co/auth/v1"
  exp    : expiry timestamp
"""

import httpx
from typing import Optional, Dict
from jose import JWTError, jwt
from app.config import settings

# Global cached keys for asymmetric signing (ES256)
_cached_jwks: Optional[Dict] = None

def get_jwks() -> Optional[Dict]:
    global _cached_jwks
    if _cached_jwks is not None:
        return _cached_jwks
    
    url = settings.SUPABASE_URL
    if not url:
        return None
        
    try:
        # Build JWKS url: {SUPABASE_URL}/auth/v1/.well-known/jwks.json
        jwks_url = f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        resp = httpx.get(jwks_url, timeout=5.0)
        if resp.status_code == 200:
            _cached_jwks = resp.json()
            return _cached_jwks
    except Exception as exc:
        print(f"[JWT WARNING] Failed to fetch live JWKS from Supabase: {exc}")
        
    # Offline fallback for the seeded project
    if "tmlhthmtojuyxfjakgej" in url:
        _cached_jwks = {
            "keys": [{
                "alg": "ES256",
                "crv": "P-256",
                "ext": True,
                "key_ops": ["verify"],
                "kid": "1f71a416-79f8-4273-8837-69ca0a6ded80",
                "kty": "EC",
                "use": "sig",
                "x": "VPmSMxTuVslRglM7djgABd4z6MTxPjBSCcujBlHn0Xc",
                "y": "OIkyThEhGPjT8deEMtHKfm_3JLhzJXM4uRDg3Z9VwuQ"
            }]
        }
        return _cached_jwks
        
    return None

def decode_access_token(token: str) -> Optional[dict]:
    """
    Validate a Supabase-issued JWT and return its payload dict.
    Supports both HS256 (symmetric) and ES256 (asymmetric JWKS) algorithms.
    """
    try:
        # Parse the unverified headers to extract the key ID (kid) and algorithm
        headers = jwt.get_unverified_header(token)
        kid = headers.get("kid")
        alg = headers.get("alg", "HS256")
        
        if alg == "HS256":
            secret = settings.SUPABASE_JWT_SECRET
            if not secret:
                return None
            return jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
            
        elif alg == "ES256":
            jwks = get_jwks()
            if not jwks:
                print("[JWT ERROR] No JWKS available for ES256 verification")
                return None
                
            # Find key matching the kid
            key_dict = None
            for k in jwks.get("keys", []):
                if k.get("kid") == kid:
                    key_dict = k
                    break
                    
            if not key_dict:
                print(f"[JWT ERROR] Key ID '{kid}' not found in JWKS")
                return None
                
            # Decode using the JWK dict
            return jwt.decode(
                token,
                key_dict,
                algorithms=["ES256"],
                options={"verify_aud": False}
            )
            
        else:
            print(f"[JWT ERROR] Unsupported algorithm: {alg}")
            return None
            
    except JWTError as exc:
        print(f"[JWT DEBUG] Decode failed: {exc}")
        return None
