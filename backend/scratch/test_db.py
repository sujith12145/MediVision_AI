import sys
sys.path.insert(0, ".")
from app.database import engine
from sqlalchemy import text

print("Connecting to database...")
try:
    with engine.connect() as conn:
        res = conn.execute(text("SELECT 1"))
        print("Success! Result:", res.fetchone())
except Exception as e:
    import traceback
    traceback.print_exc()
