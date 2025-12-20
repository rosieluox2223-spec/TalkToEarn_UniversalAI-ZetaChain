import sqlite3
import json
import os

# 数据库和文件路径
SQLITE_DB_FILE = 'talktoearn.db'
FILES_DB_FILE = 'files.json'

print("🔍 检查文件数据迁移情况...")

# 1. 检查JSON文件中的数据
if os.path.exists(FILES_DB_FILE):
    with open(FILES_DB_FILE, 'r', encoding='utf-8') as f:
        json_files = json.load(f)
    print(f"📄 JSON文件中的文件数量: {len(json_files)}")
    for file_id, file_info in json_files.items():
        print(f"   - {file_id}: {file_info['filename']} (用户: {file_info['user_id']})")
else:
    print("❌ JSON文件不存在")

print("\n" + "="*50 + "\n")

# 2. 检查数据库中的数据
conn = sqlite3.connect(SQLITE_DB_FILE)
cursor = conn.cursor()

cursor.execute('SELECT COUNT(*) FROM files')
db_count = cursor.fetchone()[0]
print(f"🗄️  数据库files表中的文件数量: {db_count}")

if db_count > 0:
    cursor.execute('SELECT id, filename, user_id FROM files LIMIT 10')
    db_files = cursor.fetchall()
    for file in db_files:
        print(f"   - {file[0]}: {file[1]} (用户: {file[2]})")
    if db_count > 10:
        print(f"   ... 还有 {db_count - 10} 个文件未显示")

# 3. 检查stakes表的关联情况
cursor.execute('SELECT COUNT(*) FROM stakes')
stakes_count = cursor.fetchone()[0]
print(f"\n💰 stakes表中的质押记录数量: {stakes_count}")

if stakes_count > 0:
    cursor.execute('SELECT s.file_id, s.amount, s.stake_time, f.filename FROM stakes s LEFT JOIN files f ON s.file_id = f.id LIMIT 5')
    stake_records = cursor.fetchall()
    print("最近的5条质押记录:")
    for record in stake_records:
        file_id = record[0]
        amount = record[1]
        stake_time = record[2]
        filename = record[3] or "未知文件"
        print(f"   - 文件: {filename} (ID: {file_id}), 金额: {amount}, 时间: {stake_time}")

conn.close()

print("\n✅ 检查完成!")
