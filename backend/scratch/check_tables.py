import sqlite3
try:
    conn = sqlite3.connect('medivision_dev.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    print("SQLite Tables:", cursor.fetchall())
except Exception as e:
    print("Error querying SQLite database:", e)
