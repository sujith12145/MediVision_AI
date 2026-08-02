import sys
import os

# Add the current folder to sys.path so we can import app
sys.path.append(os.getcwd())

from app.supabase_client import get_supabase_client
from app.config import settings

def main():
    print("Supabase URL:", settings.SUPABASE_URL)
    print("Storage Bucket:", settings.SUPABASE_STORAGE_BUCKET)
    try:
        client = get_supabase_client()
        print("Connected to Supabase successfully!")
        
        # List all buckets
        buckets = client.storage.list_buckets()
        print("\nExisting Buckets:")
        for b in buckets:
            print(f" - {b.name} (Public: {b.public})")
            
        # Check if our bucket exists
        bucket_names = [b.name for b in buckets]
        if settings.SUPABASE_STORAGE_BUCKET not in bucket_names:
            print(f"\nWARNING: Bucket '{settings.SUPABASE_STORAGE_BUCKET}' does not exist!")
            print("Attempting to create it...")
            try:
                client.storage.create_bucket(settings.SUPABASE_STORAGE_BUCKET, options={"public": True})
                print(f"SUCCESS: Created bucket '{settings.SUPABASE_STORAGE_BUCKET}' with public access.")
            except Exception as e:
                print(f"FAILED to create bucket: {e}")
        else:
            print(f"\nSUCCESS: Bucket '{settings.SUPABASE_STORAGE_BUCKET}' exists and is ready.")
            
    except Exception as e:
        print("\nERROR interacting with Supabase Storage:", e)

if __name__ == "__main__":
    main()
