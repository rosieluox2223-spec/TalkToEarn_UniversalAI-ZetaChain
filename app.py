# app.py - 基于AILibraries的多用户AI知识库分享平台
import os
import json
import numpy as np
from dotenv import load_dotenv
import sqlite3

# 加载.env文件中的环境变量
load_dotenv()
from flask import Flask, request, jsonify, Response, render_template, session, redirect, url_for
from flask_socketio import SocketIO, emit
import chardet
import time
from langchain_core.documents import Document
import uuid
from werkzeug.utils import secure_filename
import math
import hashlib
from datetime import datetime

# ==================== 导入必要的库 ====================
from langchain_text_splitters import RecursiveCharacterTextSplitter, TokenTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_chroma import Chroma
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_community.chat_models import ChatTongyi

from flask_cors import CORS

# ipfs功能调用
from upload_ipfs import upload_text_and_get_preview_url


app = Flask(__name__)
app.secret_key = 'your-secret-key-here'

# 初始化SocketIO，启用CORS支持
socketio = SocketIO(app, cors_allowed_origins="*")

CORS(
    app,
    resources={r"/connect_wallet": {"origins": "*"}},
)

# ==================== 文件路径配置 ====================
UPLOAD_FOLDER = 'USER_DATA'
SHARED_FOLDER = 'SHARED_CONTENT'
USER_DB_FILE = 'users.json'
FILES_DB_FILE = 'files.json'
TRANSACTIONS_DB_FILE = 'transactions.json'
SQLITE_DB_FILE = 'talktoearn.db'

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(SHARED_FOLDER, exist_ok=True)

# ==================== 阿里Qwen API 配置 ====================
# 从环境变量获取API密钥，支持QWEN_API_KEY和DASHSCOPE_API_KEY
API_KEY = os.getenv('QWEN_API_KEY', os.getenv('DASHSCOPE_API_KEY', 'your-api-key'))

# 添加调试信息
print(f"🚨 API_KEY加载结果: {API_KEY[:8]}...{API_KEY[-4:]}" if len(API_KEY) > 12 else f"🚨 API_KEY无效: {API_KEY}")
print(f"🚨 环境变量QWEN_API_KEY是否存在: {'是' if os.getenv('QWEN_API_KEY') else '否'}")
print(f"🚨 环境变量DASHSCOPE_API_KEY是否存在: {'是' if os.getenv('DASHSCOPE_API_KEY') else '否'}")

# 初始化Qwen嵌入模型
embeddings = DashScopeEmbeddings(
    model="text-embedding-v2",
    dashscope_api_key=API_KEY
)

# 初始化Qwen聊天模型
llm = ChatTongyi(
    model="qwen-turbo",
    temperature=0.3,
    dashscope_api_key=API_KEY
)

# 测试API连接
print("🔍 正在测试Qwen API连接...")
try:
    test_response = llm.invoke("测试连接")
    print("✅ API连接测试成功!")
except Exception as e:
    print(f"❌ API连接测试失败: {str(e)}")
    import traceback
    traceback.print_exc()

vector_store = None

# ==================== 数据库初始化 ====================

def init_db():
    """初始化SQLite数据库并创建表"""
    conn = sqlite3.connect(SQLITE_DB_FILE)
    cursor = conn.cursor()
    
    # 创建用户表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        coin_balance REAL DEFAULT 1.0,
        total_earned REAL DEFAULT 0.0,
        total_spent REAL DEFAULT 0.0,
        registration_time TEXT NOT NULL,
        wallet_account TEXT UNIQUE
    )
    ''')
    
    # 创建用户上传文件表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS uploaded_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        upload_time TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
    )
    ''')
    
    # 创建用户引用文件表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS referenced_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        file_id TEXT NOT NULL,
        question TEXT NOT NULL,
        reward REAL NOT NULL,
        timestamp TEXT NOT NULL,
        similarity REAL NOT NULL,
        weight REAL NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
    )
    ''')

 # 创建文章表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT,
        content_preview TEXT,
        upload_time TEXT,
        authorize_rag INTEGER,
        reference_count INTEGER,
        total_reward REAL,
        file_path TEXT,
        ipfs_url TEXT, 
        total_staked REAL DEFAULT 0.0)
    ''')
    
    # 创建质押记录表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS stakes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        amount REAL NOT NULL,
        content_id TEXT NOT NULL,
        stake_time TEXT DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    conn.commit()
    conn.close()

def migrate_from_json_to_db():
    """从JSON文件迁移数据到SQLite数据库"""
    conn = sqlite3.connect(SQLITE_DB_FILE)
    cursor = conn.cursor()
    
    # 检查用户表是否为空
    cursor.execute('SELECT COUNT(*) FROM users')
    if cursor.fetchone()[0] == 0:
        # 从JSON文件加载用户数据
        if os.path.exists(USER_DB_FILE):
            with open(USER_DB_FILE, 'r', encoding='utf-8') as f:
                users = json.load(f)
            
            # 迁移用户数据
            for user_id, user_data in users.items():
                # 插入用户基本信息
                cursor.execute('''
                INSERT INTO users (user_id, password_hash, coin_balance, total_earned, total_spent, registration_time, wallet_account)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    user_id,
                    user_data['password_hash'],
                    user_data['coin_balance'],
                    user_data['total_earned'],
                    user_data['total_spent'],
                    user_data['registration_time'],
                    user_data.get('wallet_account')  # 处理 JSON 中可能不存在的字段
                ))
                
                # 迁移上传文件数据
                for file_id in user_data['uploaded_files']:
                    cursor.execute('''
                    INSERT INTO uploaded_files (user_id, file_id)
                    VALUES (?, ?)
                    ''', (user_id, file_id))
                
                # 迁移引用文件数据
                for ref_file in user_data['referenced_files']:
                    cursor.execute('''
                    INSERT INTO referenced_files (user_id, file_id, question, reward, timestamp, similarity, weight)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        user_id,
                        ref_file['file_id'],
                        ref_file['question'],
                        ref_file['reward'],
                        ref_file['timestamp'],
                        ref_file['similarity'],
                        ref_file['weight']
                    ))
    
    # 检查files表是否为空，迁移文件数据
    cursor.execute('SELECT COUNT(*) FROM files')
    if cursor.fetchone()[0] == 0:
        # 从JSON文件加载文件数据
        if os.path.exists(FILES_DB_FILE):
            with open(FILES_DB_FILE, 'r', encoding='utf-8') as f:
                files_data = json.load(f)
            
            # 迁移文件数据
            for file_id, file_info in files_data.items():
                cursor.execute('''
                INSERT INTO files (id, filename, user_id, content, content_preview, upload_time, 
                                  authorize_rag, reference_count, total_reward, file_path, ipfs_url, total_staked)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    file_id,
                    file_info['filename'],
                    file_info['user_id'],
                    file_info['content'],
                    file_info['content_preview'],
                    file_info['upload_time'],
                    file_info.get('authorize_rag', 1),
                    file_info.get('reference_count', 0),
                    file_info.get('total_reward', 0.0),
                    file_info.get('file_path', ''),
                    file_info.get('ipfs_url', ''),
                    file_info.get('total_staked', 0.0)
                ))
                print(f"✅ 已迁移文件: {file_id} - {file_info['filename']}")
    
    conn.commit()
    conn.close()

# 初始化数据库
init_db()
# 从JSON迁移数据到数据库
migrate_from_json_to_db()

# ==================== 用户管理系统 ====================

# 数据库连接辅助函数
def get_db_connection():
    conn = sqlite3.connect(SQLITE_DB_FILE)
    conn.row_factory = sqlite3.Row  # 返回字典形式的行
    return conn

# 替代原来的load_users函数
def get_user(user_id):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)).fetchone()
    conn.close()
    return user

def load_users():
    if os.path.exists(USER_DB_FILE):
        with open(USER_DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

# 替代原来的save_users函数
def update_user(user_id, **kwargs):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 构建更新语句
    columns = ', '.join([f"{col} = ?" for col in kwargs.keys()])
    values = list(kwargs.values()) + [user_id]
    
    cursor.execute(f"UPDATE users SET {columns} WHERE user_id = ?", values)
    conn.commit()
    conn.close()

def save_users(users):
    with open(USER_DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)
    # print("save_user")

def add_user(user_id, password_hash, coin_balance=1.0, total_earned=0.0, total_spent=0.0, registration_time=None, wallet_account=None):
    # print("add_add_user")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if registration_time is None:
        registration_time = datetime.now().isoformat()
    
    cursor.execute('''
    INSERT INTO users (user_id, password_hash, coin_balance, total_earned, total_spent, registration_time, wallet_account)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, password_hash, coin_balance, total_earned, total_spent, registration_time, wallet_account))
    
    conn.commit()
    conn.close()

def add_user_list(user_id):
    # print("add_user")
    users = load_users()
    users[user_id] = {
        'password_hash': hash_password(123456),
        'coin_balance': 1.0,
        'total_earned': 0.0,  # 🎯 确保初始化为0
        'total_spent': 0.0,   # 🎯 确保初始化为0
        'registration_time': datetime.now().isoformat(),
        'uploaded_files': [],
        'referenced_files': []  # 🎯 确保这个字段存在
    }
    # print("load_user ")
    save_users(users)
    

# 上传文件相关函数
def add_uploaded_file(user_id, file_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    INSERT INTO uploaded_files (user_id, file_id)
    VALUES (?, ?)
    ''', (user_id, file_id))
    
    conn.commit()
    conn.close()

def get_uploaded_files(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT file_id FROM uploaded_files WHERE user_id = ?', (user_id,))
    files = [row[0] for row in cursor.fetchall()]
    
    conn.close()
    return files

# 引用文件相关函数
def add_referenced_file(user_id, file_id, question, reward, timestamp, similarity, weight):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
    INSERT INTO referenced_files (user_id, file_id, question, reward, timestamp, similarity, weight)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, file_id, question, reward, timestamp, similarity, weight))
    
    conn.commit()
    conn.close()

def get_referenced_files(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM referenced_files WHERE user_id = ?', (user_id,))
    refs = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return refs

def load_files():
    if os.path.exists(FILES_DB_FILE):
        with open(FILES_DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_files(files):
    with open(FILES_DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(files, f, ensure_ascii=False, indent=2)

def load_transactions():
    if os.path.exists(TRANSACTIONS_DB_FILE):
        with open(TRANSACTIONS_DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def save_transactions(transactions):
    with open(TRANSACTIONS_DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(transactions, f, ensure_ascii=False, indent=2)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# def register_user(user_id, password):
#     conn = get_db_connection()
    
#     # 检查用户ID是否已存在
#     existing_user = conn.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)).fetchone()
#     if existing_user:
#         conn.close()
#         return False, "用户ID已存在"
    
#     # 创建新用户
#     add_user(user_id, hash_password(password))
#     conn.close()
#     return True, "注册成功"

def authenticate_user(user_id, password):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)).fetchone()
    conn.close()
    
    if not user:
        return False, "用户不存在"
    
    if user['password_hash'] != hash_password(password):
        return False, "密码错误"
    
    return True, "登录成功"

def get_user_stats(user_id):
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)).fetchone()
    
    if not user:
        conn.close()
        return None
    
    # 获取上传文件数量
    uploaded_files_count = conn.execute('SELECT COUNT(*) FROM uploaded_files WHERE user_id = ?', (user_id,)).fetchone()[0]
    conn.close()
    
    # 获取交易数据
    transactions = load_transactions()
    today = datetime.now().date()
    
    today_earned = 0.0
    today_references = 0
    
    for tx in transactions:
        tx_time = datetime.fromisoformat(tx['timestamp']).date()
        if tx_time == today:
            if tx['type'] == 'reward' and tx['to_user'] == user_id:
                today_earned += tx['amount']
            elif tx['type'] == 'reference' and tx['file_owner'] == user_id:
                today_references += 1
    
    return {
        'coin_balance': user['coin_balance'],
        'total_earned': user['total_earned'],
        'total_spent': user['total_spent'],
        'today_earned': today_earned,
        'today_references': today_references,
        'uploaded_files_count': uploaded_files_count
    }

def get_user_status(user_id):
    users = load_users()
    if user_id not in users:
        return None
    
    user = users[user_id]
    transactions = load_transactions()
    today = datetime.now().date()
    
    today_earned = 0.0
    today_references = 0
    
    for tx in transactions:
        tx_time = datetime.fromisoformat(tx['timestamp']).date()
        if tx_time == today:
            if tx['type'] == 'reward' and tx['to_user'] == user_id:
                today_earned += tx['amount']
            elif tx['type'] == 'reference' and tx['file_owner'] == user_id:
                today_references += 1
    
    return {
        'coin_balance': user['coin_balance'],
        'total_earned': user['total_earned'],
        'total_spent': user['total_spent'],
        'today_earned': today_earned,
        'today_references': today_references,
        'uploaded_files_count': len(user['uploaded_files'])
    }


@app.route('/connect_wallet', methods=['POST','OPTIONS'])
def connect_wallet():
    """处理钱包连接请求"""
    print("开始连接钱包")
    if request.method == 'OPTIONS':
        return jsonify({'success': True}), 200
    # data = request.get_json()
    data = request.get_json(silent=True) or {}
    wallet_address = data.get('wallet_address')
    print(wallet_address)
    if not wallet_address:
        return jsonify({'success': False, 'message': '钱包地址不能为空'})
    

    #检查用户是否在列表
    users = load_users()
    user_id = wallet_address
    password = '123456'
    
    if user_id in users:
        print("钱包用户已在列表")
    else:
        print("新用户创建")
        users[user_id] = {
        'password_hash': hash_password(password),
        'coin_balance': 1.0,
        'total_earned': 0.0,  #初始化为0
        'total_spent': 0.0,   # 初始化为0
        'registration_time': datetime.now().isoformat(),
        'uploaded_files': [],
        'referenced_files': []  #这个字段存在
        } 
        save_users(users)

    # 检查钱包地址是否已存在
    conn = get_db_connection()
    existing_user = conn.execute('SELECT * FROM users WHERE wallet_account = ?', (wallet_address,)).fetchone()
    
    if existing_user:
        # 钱包地址已存在，返回用户信息
        conn.close()
        return jsonify({
            'success': True,
            'message': '钱包已连接',
            'user_id': existing_user['user_id'],
            'wallet_account': existing_user['wallet_account']
        })

    # 钱包地址不存在，创建新用户
    try:
        print("连接用户列表")
        # 使用钱包地址作为 user_id，默认密码 123456
        user_id = wallet_address
        password = '123456'
        
        # 检查 user_id 是否已存在
        user_exists = conn.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)).fetchone()
        if user_exists:
            conn.close()
            return jsonify({'success': False, 'message': '用户ID已存在'})
        
        # 创建新用户
        add_user(user_id, hash_password(password))
        
        # 更新钱包地址
        update_user(user_id, wallet_account=wallet_address)
        
        conn.close()
        
        return jsonify({
            'success': True,
            'message': '钱包已连接并创建新用户',
            'user_id': user_id,
            'wallet_account': wallet_address,
            'default_password': password  # 提示用户使用默认密码登录
        })
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': f'连接钱包失败: {str(e)}'})


def calculate_user_earnings(user_id):
    """重新计算用户的总收益 - 修复统计问题"""
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)).fetchone()
    
    if not user:
        conn.close()
        return 0.0, 0.0, 0
    
    transactions = load_transactions()
    
    total_earned = 0.0
    total_spent = 0.0
    reference_count = 0
    
    # 重新计算所有交易
    for tx in transactions:
        # 计算收益（奖励和引用）
        if tx['to_user'] == user_id and tx['type'] in ['reward', 'reference']:
            total_earned += tx['amount']
            if tx['type'] == 'reference':
                reference_count += 1
        # 计算支出
        elif tx['from_user'] == user_id and tx['type'] == 'spend':
            total_spent += tx['amount']
    
    # 确保余额正确
    initial_balance = 1.0  # 注册时赠送的1coin
    calculated_balance = initial_balance + total_earned - total_spent
    calculated_balance = max(0, calculated_balance)  # 余额不能为负
    
    # 更新用户数据
    update_user(user_id, total_earned=total_earned, total_spent=total_spent, coin_balance=calculated_balance)
    conn.close()



    
    print(f"💰 用户 {user_id} 收益统计: 总收益={total_earned:.6f}, 总支出={total_spent:.6f}, 引用次数={reference_count}")
    
    return total_earned, total_spent, reference_count


def record_transaction(tx_type, from_user, to_user, amount, file_owner=None, file_id=None, question=None):
    """修复交易记录函数 - 确保余额正确更新"""
    transactions = load_transactions()
    
    transaction = {
        'id': str(uuid.uuid4()),
        'type': tx_type,
        'from_user': from_user,
        'to_user': to_user,
        'amount': amount,
        'file_owner': file_owner,
        'file_id': file_id,
        'question': question,
        'timestamp': datetime.now().isoformat()
    }
    
    transactions.append(transaction)
    save_transactions(transactions)
    
    print(f"💾 记录交易: {tx_type}, 从 {from_user} 到 {to_user}, 金额 {amount:.8f}")
    
    conn = get_db_connection()
    
    if tx_type == 'spend' and from_user:
        # 确保余额不会变成负数
        conn.execute('''
        UPDATE users SET 
            coin_balance = MAX(0, coin_balance - ?),
            total_spent = total_spent + ?
        WHERE user_id = ?
        ''', (amount, amount, from_user))
        print(f"💸 用户 {from_user} 支出 {amount:.8f}")
    
    if tx_type == 'reward' and to_user:
        conn.execute('''
        UPDATE users SET 
            coin_balance = coin_balance + ?,
            total_earned = total_earned + ?
        WHERE user_id = ?
        ''', (amount, amount, to_user))
        print(f"🎁 用户 {to_user} 获得奖励 {amount:.8f}")
    
    conn.commit()
    conn.close()
    
    # 再次验证数据是否保存成功
    if to_user and tx_type == 'reward':
        user = get_user(to_user)
        print(f"✅ 最终验证: 用户 {to_user} 余额已更新为 {user['coin_balance']:.6f}")
    if from_user and tx_type == 'spend':
        user = get_user(from_user)
        print(f"✅ 最终验证: 用户 {from_user} 余额已更新为 {user['coin_balance']:.6f}")

@app.route('/profile')
def user_profile():
    users = load_users()
    wallet_address = request.args.get('wallet_address', '').strip()
    print("wallet_address:", wallet_address)

    print("wallet_address:", wallet_address)

    if wallet_address not in users:
        return jsonify({'success': False, 'message': '钱包未注册，请先连接钱包'})
    
    user_id = wallet_address

    
    # 🎯 重新计算用户收益确保数据准确
    total_earned, total_spent, _ = calculate_user_earnings(user_id)
    
    # 重新加载最新数据
    user = get_user(user_id)
    
    if not user:
        return redirect('/logout')
    
    # 转换为字典格式以便模板使用
    user_dict = dict(user)
    
    # 获取上传文件和引用文件
    user_dict['uploaded_files'] = get_uploaded_files(user_id)
    user_dict['referenced_files'] = get_referenced_files(user_id)
    
    transactions = load_transactions()
    
    # 获取用户的交易记录
    user_transactions = []
    for tx in transactions:
        if tx['from_user'] == user_id or tx['to_user'] == user_id:
            user_transactions.append(tx)
    
    # 按时间倒序排列，取最近20条
    user_transactions.sort(key=lambda x: x['timestamp'], reverse=True)
    recent_transactions = user_transactions[:20]
    
    # 获取用户文件引用统计
    user_files = search_files(user_id=user_id)
    reference_stats = []
    
    for file_info in user_files:
        file_references = [tx for tx in transactions 
                          if tx.get('file_id') == file_info['file_id'] and tx['type'] == 'reference']
        reference_stats.append({
            'file_id': file_info['file_id'],
            'filename': file_info['filename'],
            'reference_count': len(file_references),
            'total_reward': file_info.get('total_reward', 0)
        })
    
    # 计算今日收益
    today = datetime.now().date()
    today_earned = 0.0
    today_references = 0
    
    for tx in transactions:
        if tx['to_user'] == user_id and tx['type'] == 'reward':
            tx_time = datetime.fromisoformat(tx['timestamp']).date()
            if tx_time == today:
                today_earned += tx['amount']
        elif tx.get('file_owner') == user_id and tx['type'] == 'reference':
            tx_time = datetime.fromisoformat(tx['timestamp']).date()
            if tx_time == today:
                today_references += 1
    
    # 调试信息
    print(f"📊 Profile页面 - 用户: {user_id}")
    print(f"💰 余额: {user['coin_balance']:.6f}")
    print(f"📈 总收益: {user['total_earned']:.6f}")
    print(f"📉 总支出: {user['total_spent']:.6f}")
    print(f"📁 文件数: {len(user_files)}")
    print(f"📋 交易记录数: {len(recent_transactions)}")
    print(f"🎯 今日收益: {today_earned:.6f}, 今日引用: {today_references}")
    
    return render_template('profile.html',
                         user_id=user_id,
                         user=user_dict,
                         transactions=recent_transactions,
                         reference_stats=reference_stats,
                         today_earned=today_earned,
                         today_references=today_references)


# ==================== 文件管理系统 ====================
#增设ipfs上传功能
def save_shared_file(user_id, filename, content, authorize_rag=True):
    files = load_files()
    
    # 生成文件ID - 确保格式正确
    file_id = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{user_id}"
    
    # 创建文件路径 - 使用文件ID作为文件名
    filepath = os.path.join(SHARED_FOLDER, f"{file_id}.txt")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    try:
        preview_url = upload_text_and_get_preview_url(
        text_content=content,
        name=filename,
        description=file_id,
        file_name=filename
    )
        print("浏览ipfs-url:", preview_url)

    except Exception as e:
        print("上传失败:", e)

    ipfs_url=str(preview_url)
    files[file_id] = {
        'filename': filename,
        'user_id': user_id,
        'content': content,
        'content_preview': content[:200] + "..." if len(content) > 200 else content,
        'upload_time': datetime.now().isoformat(),
        'authorize_rag': authorize_rag,
        'reference_count': 0,
        'total_reward': 0.0,
        'file_path': filepath,
        'ipfs_url': ipfs_url
    }
    
    save_files(files)

    users = load_users()
    if user_id in users:
        users[user_id]['uploaded_files'].append(file_id)
        save_users(users)
    
    # 使用数据库添加上传文件记录
    add_uploaded_file(user_id, file_id)
    
    if authorize_rag:
        try:
            print(f"开始将文件添加到知识库: {file_id}, 文件名: {filename}")
            add_file_to_vector_store(filepath, file_id, user_id, filename,ipfs_url)
            print(f"成功将文件添加到知识库: {file_id}")
        except Exception as e:
            print(f"添加到知识库失败: {e}")
    
    return file_id

def add_file_to_vector_store(filepath, file_id, user_id, filename,ipfs_url):
    global vector_store

    try:
        init_vector_store(filepath,None,None,None,ipfs_url)
        print(f"成功添加文件到知识库: {filename}")
    except Exception as e:
        print(f"添加文件到向量库失败: {e}")
        raise

# # 在 app.py 中找到 search_files 函数，并进行类似如下修改
# def search_files(file_id=None, user_id=None, keyword=None):
#     files = load_files()
#     results = []
    
#     for fid, file_info in files.items():
#         match = True
        
#         if file_id and fid != file_id:
#             match = False
#         if user_id and file_info['user_id'] != user_id:
#             match = False
#         if keyword:
#             # 扩展搜索范围：同时匹配文件ID、文件名和文件内容
#             keyword_lower = keyword.lower()
#             file_id_match = (fid.lower().find(keyword_lower) != -1)
#             filename_match = (file_info['filename'].lower().find(keyword_lower) != -1)
#             content_match = (file_info['content'].lower().find(keyword_lower) != -1)
            
#             if not (file_id_match or filename_match or content_match):
#                 match = False
                
#         if match:
#             results.append({
#                 'file_id': fid,
#                 **file_info
#             })
    
#     return sorted(results, key=lambda x: x['upload_time'], reverse=True)

def search_files_in_content(files, keyword):
    """在文件内容中搜索关键词"""
    keyword_lower = keyword.lower()
    results = []
    
    for file_id, file_data in files.items():
        # 搜索文件名
        if keyword_lower in file_data.get('filename', '').lower():
            results.append(file_id)
            continue
            
        # 搜索文件内容
        if keyword_lower in file_data.get('content', '').lower():
            results.append(file_id)
            continue
            
        # 搜索文件ID
        if keyword_lower in file_id.lower():
            results.append(file_id)
            continue
            
        # 搜索用户ID
        if keyword_lower in file_data.get('user_id', '').lower():
            results.append(file_id)
    
    return results


# ==================== 智能奖励分配系统 ====================

def calculate_reward_distribution(relevant_docs, total_cost):
    """修复奖励计算函数"""
    if not relevant_docs:
        print("⚠️ 没有相关文档，无法分配奖励")
        return {}
    
    similarities = []
    file_similarities = {}
    
    print(f"📊 开始计算奖励分布: 总成本 {total_cost:.6f}, 文档数 {len(relevant_docs)}")
    
    for doc in relevant_docs:
        file_id = doc.metadata.get('file_id')
        similarity = doc.metadata.get('semantic_similarity', 0.3)
        
        print(f"📄 文档 {file_id}: 相似度 {similarity:.3f}")
        
        if file_id:
            if file_id not in file_similarities:
                file_similarities[file_id] = []
            file_similarities[file_id].append(similarity)
            similarities.append(similarity)
    
    if not similarities:
        print("⚠️ 没有有效的相似度数据")
        return {}
    
    # 计算每个文件的平均相似度
    file_avg_similarities = {}
    for file_id, sim_list in file_similarities.items():
        file_avg_similarities[file_id] = sum(sim_list) / len(sim_list)
        print(f"📈 文件 {file_id}: 平均相似度 {file_avg_similarities[file_id]:.3f}")
        send_system_message('info', f"文件 {file_id}: 平均相似度 {file_avg_similarities[file_id]:.3f}")
    
    total_similarity = sum(file_avg_similarities.values())
    print(f"📊 总相似度: {total_similarity:.3f}")
    send_system_message('info', f"总相似度: {total_similarity:.3f}")
    
    if total_similarity == 0:
        print("⚠️ 总相似度为0，无法分配奖励")
        return {}
    
    reward_distribution = {}
    for file_id, avg_similarity in file_avg_similarities.items():
        weight = avg_similarity / total_similarity
        reward = weight * total_cost
        
        print(f"💰 文件 {file_id}: 权重 {weight:.3f}, 奖励 {reward:.8f} coin")
        send_system_message('info', f"文件 {file_id}: 权重 {weight:.3f}, 奖励 {reward:.8f} coin")
        
        reward_distribution[file_id] = {
            'reward': reward,
            'weight': weight,
            'similarity': avg_similarity
        }
    
    total_distributed = sum(info['reward'] for info in reward_distribution.values())
    print(f"🎯 总分配金额: {total_distributed:.8f} coin")
    send_system_message('info', f"总分配金额: {total_distributed:.8f} coin")
    
    return reward_distribution

def distribute_rewards(user_id, question, relevant_docs, total_cost):
    """修复奖励分配函数 - 确保奖励正确分配和记录"""
    reward_distribution = calculate_reward_distribution(relevant_docs, total_cost)
    
    files = load_files()
    transactions = load_transactions()
    
    distribution_info = {}
    total_distributed = 0.0
    
    print(f"🔍 开始奖励分配: 总成本 {total_cost:.6f}, 相关文档 {len(relevant_docs)} 个")
    send_system_message('info', f"开始奖励分配: 总成本 {total_cost:.6f}, 相关文档 {len(relevant_docs)} 个")
    
    conn = get_db_connection()
    
    for file_id, reward_info in reward_distribution.items():
        try:
            # 尝试找到匹配的文件
            file_info = None
            if file_id and file_id in files:

                print('---------',file_id)

                file_info = files[file_id]
            else:
                # 如果file_id不匹配，尝试通过文件名或内容匹配
                print(f"⚠️ 文件ID {file_id} 不在files.json中，尝试其他匹配方式")
                
                # 尝试通过文件名匹配（去掉_test后缀）
                base_file_id = file_id.replace('_test', '') if file_id else ''
                print(f"🔍 尝试基础文件名匹配: {base_file_id}")
                
                for actual_file_id, actual_file_info in files.items():
                    # 检查文件名是否包含基础file_id或内容是否匹配
                    if base_file_id and (
                        base_file_id in actual_file_id or 
                        base_file_id in actual_file_info.get('filename', '') or
                        ('编程语言' in actual_file_info.get('content', '') and file_id == 'code_test')
                    ):
                        print(f"✅ 找到匹配文件: {actual_file_id} (原file_id: {file_id})")
                        file_info = actual_file_info
                        file_id = actual_file_id  # 更新file_id为实际的file_id
                        break
                
                if not file_info:
                    print(f"❌ 无法找到与 {file_id} 匹配的文件")
                
            if file_info:
                file_owner = file_info['user_id']
                reward_amount = reward_info['reward']
                
                # 检查用户是否存在
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM users WHERE user_id = ?', (file_owner,))
                user = cursor.fetchone()
                if user and reward_amount > 0:
                    try:
                        # 更新用户余额和总收益
                        cursor.execute('''
                        UPDATE users SET 
                            coin_balance = coin_balance + ?,
                            total_earned = total_earned + ?
                        WHERE user_id = ?
                        ''', (reward_amount, reward_amount, file_owner))
                        
                        # 记录奖励交易
                        reward_tx = {
                            'id': str(uuid.uuid4()),
                            'type': 'reward',
                            'from_user': None,  # 系统发放
                            'to_user': file_owner,
                            'amount': reward_amount,
                            'file_owner': file_owner,
                            'file_id': file_id,
                            'question': question,
                            'timestamp': datetime.now().isoformat()
                        }
                        transactions.append(reward_tx)
                        
                        # 记录引用交易
                        reference_tx = {
                            'id': str(uuid.uuid4()),
                            'type': 'reference',
                            'from_user': user_id,
                            'to_user': file_owner,
                            'amount': 0.0,  # 引用记录，金额为0
                            'file_owner': file_owner,
                            'file_id': file_id,
                            'question': question,
                            'timestamp': datetime.now().isoformat()
                        }
                        transactions.append(reference_tx)
                        
                        # 更新文件统计
                        files[file_id]['reference_count'] += 1
                        files[file_id]['total_reward'] += reward_amount

                        users=load_users()
                        if 'referenced_files' not in users[file_owner]:
                            users[file_owner]['referenced_files'] = []
                    
                        reference_record = {
                                'file_id': file_id,
                                'question': question,
                                'reward': reward_amount,
                                'timestamp': datetime.now().isoformat(),
                                'similarity': reward_info.get('similarity', 0),
                                'weight': reward_info.get('weight', 0)
                                }           
                        users[file_owner]['referenced_files'].append(reference_record)
                        save_users(users)
                        
                        total_distributed += reward_amount
                        
                        # 获取file_owner的钱包地址
                        wallet_account = user['wallet_account'] if user['wallet_account'] else '未绑定钱包'
                        
                        print(f"✅ 成功分配奖励: {file_owner} (钱包: {wallet_account}) 获得 {reward_amount:.8f} coin")
                        print(f"🔍 钱包地址类型: {type(wallet_account)}, 值: {wallet_account}")
                        print(f"🔍 钱包地址比较: wallet_account != '未绑定钱包' -> {wallet_account != '未绑定钱包'}")
                        
                        send_system_message('success', f"成功分配奖励: {file_owner} (钱包: {wallet_account}) 获得 {reward_amount:.8f} coin")
                        
                        # 发送转账意图到前端
                        if wallet_account and wallet_account != '未绑定钱包' and wallet_account != '':
                            print(f"🚀 发送转账意图到前端，钱包地址: {wallet_account}")
                            transfer_intent = {
                                "action": "transfer",
                                "fromChain": "zetachain",
                                "toChain": "zetachain",
                                "fromToken": "ZETA",
                                "toToken": "ZETA",
                                "amount": "0.01",
                                "recipient": wallet_account
                            }
                            socketio.emit('system_message', {'type': 'intent', 'data': transfer_intent}, namespace='/ws')
                            print(f"✅ 转账意图发送成功")
                        else:
                            print(f"❌ 不发送转账意图: 钱包地址无效 -> {wallet_account}")
                    except Exception as e:
                        print(f"❌ 奖励分配失败 {file_id}: {e}")
            else:
                print(f"❌ 找不到文件 {file_id} 的匹配信息")
        except Exception as e:
            print(f"❌ 处理文件 {file_id} 时出错: {e}")
    
    # 确保数据保存
    save_files(files)
    save_transactions(transactions)
    conn.commit()
    conn.close()
    
    print(f"🎯 奖励分配完成: 总分配金额 {total_distributed:.8f} coin")
    send_system_message('success', f"奖励分配完成: 总分配金额 {total_distributed:.8f} coin")
    return distribution_info

def extract_file_id_from_source(source):
    """从文件路径中提取file_id"""
    if not source:
        return None
    
    # 从文件路径中提取文件名（不带扩展名）
    filename = os.path.basename(source)
    if '.' in filename:
        file_id = filename.split('.')[0]  # 去掉扩展名
    else:
        file_id = filename
    
    print(f"🔍 从source提取file_id: {source} -> {file_id}")
    return file_id

def calculate_reward_distribution(relevant_docs, total_cost):
    """修复奖励计算函数 - 处理file_id为None的情况"""
    if not relevant_docs:
        print("⚠️ 没有相关文档，无法分配奖励")
        send_system_message('warning', "没有相关文档，无法分配奖励")
        return {}
    
    similarities = []
    file_similarities = {}
    
    print(f"📊 开始计算奖励分布: 总成本 {total_cost:.6f}, 文档数 {len(relevant_docs)}")
    send_system_message('info', f"开始计算奖励分布: 总成本 {total_cost:.6f}, 文档数 {len(relevant_docs)}")
    
    for doc in relevant_docs:
        file_id = doc.metadata.get('file_id')
        similarity = doc.metadata.get('semantic_similarity', 0.3)
        
        # 如果file_id为None，尝试从source中提取
        if file_id is None:
            source = doc.metadata.get('source', '')
            file_id = extract_file_id_from_source(source)
            print(f"🔄 计算奖励时提取file_id: {source} -> {file_id}")
        
        print(f"📄 文档 {file_id}: 相似度 {similarity:.3f}")
        send_system_message('info', f"文档 {file_id}: 相似度 {similarity:.3f}")
        
        if file_id:
            if file_id not in file_similarities:
                file_similarities[file_id] = []
            file_similarities[file_id].append(similarity)
            similarities.append(similarity)
    
    if not similarities:
        print("⚠️ 没有有效的相似度数据")
        return {}
    
    # 计算每个文件的平均相似度
    file_avg_similarities = {}
    for file_id, sim_list in file_similarities.items():
        file_avg_similarities[file_id] = sum(sim_list) / len(sim_list)
        print(f"📈 文件 {file_id}: 平均相似度 {file_avg_similarities[file_id]:.3f}")
    
    total_similarity = sum(file_avg_similarities.values())
    print(f"📊 总相似度: {total_similarity:.3f}")
    
    if total_similarity == 0:
        print("⚠️ 总相似度为0，无法分配奖励")
        return {}
    
    reward_distribution = {}
    for file_id, avg_similarity in file_avg_similarities.items():
        weight = avg_similarity / total_similarity
        reward = weight * total_cost
        
        print(f"💰 文件 {file_id}: 权重 {weight:.3f}, 奖励 {reward:.8f} coin")
        
        reward_distribution[file_id] = {
            'reward': reward,
            'weight': weight,
            'similarity': avg_similarity
        }
    
    total_distributed = sum(info['reward'] for info in reward_distribution.values())
    print(f"🎯 总分配金额: {total_distributed:.8f} coin")
    
    return reward_distribution



# ==================== 从AILibraries复制的核心AI功能 ====================

def enhanced_cosine_similarity(vec1, vec2):
    vec1 = np.array(vec1).flatten()
    vec2 = np.array(vec2).flatten()
    
    if np.all(vec1 == 0) or np.all(vec2 == 0):
        return 0.0
    
    dot_product = np.dot(vec1, vec2)
    norm_vec1 = np.linalg.norm(vec1)
    norm_vec2 = np.linalg.norm(vec2)
    
    if norm_vec1 == 0 or norm_vec2 == 0:
        return 0.0
    
    similarity = dot_product / (norm_vec1 * norm_vec2)
    similarity = max(-1.0, min(1.0, similarity))
    
    return float(similarity)

def llm_based_relevance_check(question, document_content, llm_model):
    try:
        truncated_content = document_content[:800] + "..." if len(document_content) > 800 else document_content
        
        prompt = f"""请严格判断以下文档内容是否与用户问题相关。请只回答"相关"或"不相关"，不要解释。

用户问题：{question}

文档内容：{truncated_content}

请判断文档内容是否与用户问题相关，只回答"相关"或"不相关"："""
        
        response = llm_model.invoke(prompt)
        response_text = response.content.strip().lower()
        print(f"LLM相关性判断结果: '{response_text}'")
        
        return "相关" in response_text and "不相关" not in response_text
        
    except Exception as e:
        print(f"LLM相关性判断错误: {e}")
        return False

def hybrid_relevance_check(question, doc, embeddings_model, llm_model):
    semantic_similarity = calculate_semantic_similarity(question, doc.page_content, embeddings_model)
    
    # 检测是否是概念性问题
    is_conceptual_question = any(keyword in question for keyword in 
                                ["什么是", "什么叫", "定义", "概念", "含义", "解释", "为什么"])
    
    if semantic_similarity > 0.7:
        return True, semantic_similarity
    elif semantic_similarity > 0.3 or (is_conceptual_question and semantic_similarity > 0.2):
        # 对于概念性问题，降低阈值到0.2，给予LLM判断的机会
        is_llm_relevant = llm_based_relevance_check(question, doc.page_content, llm_model)
        return is_llm_relevant, semantic_similarity
    else:
        return False, semantic_similarity

def calculate_jaccard_similarity(text1, text2):
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    
    if not words1 and not words2:
        return 0.0
    
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))
    
    return intersection / union if union > 0 else 0.0

def calculate_semantic_similarity(question, document_content, embeddings_model):
    try:
        question_embedding = embeddings_model.embed_query(question)
        doc_embedding = embeddings_model.embed_query(document_content)
        
        base_similarity = enhanced_cosine_similarity(question_embedding, doc_embedding)
        
        is_conceptual_question = any(keyword in question for keyword in 
                                    ["什么是", "什么叫", "定义", "概念", "含义", "解释"])
        
        doc_length = len(document_content.split())
        if is_conceptual_question:
            length_factor = min(1.0, doc_length / 25)
        else:
            length_factor = min(1.0, doc_length / 40)
        
        jaccard_similarity = calculate_jaccard_similarity(question, document_content)
        
        concept_keywords = {
            "爱": ["爱", "爱情", "爱心", "关爱", "热爱", "情感", "感情", "关系", "亲密", "定义", "概念"],
            "什么是": ["定义", "概念", "含义", "解释", "是什么", "什么叫", "意味着", "指的是"],
            "编程语言": ["编程", "语言", "编程语言", "代码", "程序", "计算机", "语法", "语义", "功能"]
        }
        
        keyword_boost = 0.0
        for concept, keywords in concept_keywords.items():
            if concept in question:
                keyword_matches = sum(1 for keyword in keywords if keyword in document_content)
                if keyword_matches > 0:
                    if is_conceptual_question:
                        keyword_boost = min(0.25, keyword_matches * 0.08)
                    else:
                        keyword_boost = min(0.15, keyword_matches * 0.05)
                    print(f"关键词匹配增强: 匹配到 {keyword_matches} 个相关关键词，提升 {keyword_boost:.3f}")
                    break
        
        question_len = len(question)
        doc_len = len(document_content)
        if question_len > 0 and doc_len > 0:
            length_similarity = 1 - abs(question_len - doc_len) / (question_len + doc_len)
        else:
            length_similarity = 0
        
        if is_conceptual_question:
            semantic_similarity = (
                0.75 * base_similarity +
                0.05 * jaccard_similarity +
                0.1 * length_factor +
                0.1 * length_similarity +
                keyword_boost
            )
            semantic_similarity = 1 / (1 + math.exp(-6 * (semantic_similarity - 0.4)))
        else:
            semantic_similarity = (
                0.8 * base_similarity +
                0.05 * jaccard_similarity +
                0.1 * length_factor +
                0.05 * length_similarity +
                keyword_boost
            )
            semantic_similarity = 1 / (1 + math.exp(-10 * (semantic_similarity - 0.55)))
        
        print(f"相似度分解 - 语义:{base_similarity:.3f}, Jaccard:{jaccard_similarity:.3f}, 长度因子:{length_factor:.3f}, 关键词增强:{keyword_boost:.3f}, 综合:{semantic_similarity:.3f}")
        
        return semantic_similarity
        
    except Exception as e:
        print(f"语义相似度计算错误: {e}")
        return 0.4

def adaptive_filter_relevant_docs(question, docs, embeddings_model, llm_model):
    relevant_docs = []
    
    print(f"开始自适应过滤 {len(docs)} 个文档")
    
    is_conceptual_question = any(keyword in question for keyword in 
                                ["什么是", "什么叫", "定义", "概念", "含义", "解释", "为什么"])
    
    if is_conceptual_question:
        print("检测到概念性问题，采用LLM主导的过滤策略")
    
    for i, doc in enumerate(docs):
        try:
            is_relevant, similarity = hybrid_relevance_check(question, doc, embeddings_model, llm_model)
            
            doc_preview = doc.page_content[:50] + "..." if len(doc.page_content) > 50 else doc.page_content
            print(f"文档 {i+1} 混合相似度: {similarity:.3f}, 相关: {is_relevant} - 内容: {doc_preview}")
            
            if is_relevant:
                doc.metadata['semantic_similarity'] = float(similarity)
                relevant_docs.append((similarity, doc))
                
        except Exception as e:
            print(f"文档 {i+1} 相关性判断错误: {e}")
            doc.metadata['semantic_similarity'] = 0.4
            relevant_docs.append((0.4, doc))
    
    if not relevant_docs:
        return []
    
    relevant_docs.sort(key=lambda x: x[0], reverse=True)
    
    llm_relevant_docs = [doc for similarity, doc in relevant_docs]
    
    if is_conceptual_question:
        max_docs = min(6, len(llm_relevant_docs))
        filtered_docs = llm_relevant_docs[:max_docs]
        print(f"概念性问题 - 保留所有LLM判断相关的文档: {len(filtered_docs)} 个")
    else:
        similarities = [similarity for similarity, doc in relevant_docs]
        if len(similarities) > 0:
            avg_similarity = sum(similarities) / len(similarities)
            dynamic_threshold = max(0.40, avg_similarity + 0.2 * math.sqrt(sum((x - avg_similarity) ** 2 for x in similarities) / len(similarities)))
            filtered_docs = [doc for similarity, doc in relevant_docs if similarity >= dynamic_threshold]
            filtered_docs = filtered_docs[:4]
            print(f"普通问题 - 动态阈值: {dynamic_threshold:.3f}, 保留: {len(filtered_docs)} 个文档")
        else:
            filtered_docs = llm_relevant_docs[:3]
    
    print(f"过滤后保留 {len(filtered_docs)} 个相关文档")
    return filtered_docs

def intelligent_rag_decision(question, relevant_docs):
    if not relevant_docs:
        return False, "没有相关文档", 0.0
    
    similarities = [doc.metadata.get('semantic_similarity', 0) for doc in relevant_docs]
    max_similarity = max(similarities) if similarities else 0
    avg_similarity = sum(similarities) / len(similarities) if similarities else 0
    
    print(f"RAG决策 - 最高相似度: {max_similarity:.3f}, 平均相似度: {avg_similarity:.3f}")
    
    is_conceptual_question = any(keyword in question for keyword in 
                                ["什么是", "什么叫", "定义", "概念", "含义", "解释", "为什么"])
    
    if is_conceptual_question:
        if len(relevant_docs) == 0:
            return False, "没有相关文档", 0.0
        else:
            doc_count_factor = min(1.0, len(relevant_docs) / 3.0)
            similarity_factor = min(1.0, max_similarity / 0.7)
            
            confidence = 0.5 + 0.3 * doc_count_factor + 0.2 * similarity_factor
            confidence = min(0.9, confidence)
            
            return True, f"找到 {len(relevant_docs)} 个相关文档 (最高相似度:{max_similarity:.3f})", confidence
    else:
        if max_similarity < 0.45:
            return False, f"最高相似度 {max_similarity:.3f} 过低", max_similarity
        elif avg_similarity < 0.40:
            return False, f"平均相似度 {avg_similarity:.3f} 过低", max_similarity
        else:
            confidence = min(1.0, (max_similarity - 0.5) * 2.0)
            return True, f"文档相关性足够 (最高:{max_similarity:.3f}, 平均:{avg_similarity:.3f})", confidence

def hybrid_answering_strategy(question, relevant_docs, confidence):
    is_conceptual_question = any(keyword in question for keyword in 
                                ["什么是", "什么叫", "定义", "概念", "含义", "解释", "为什么"])
    
    # 将文档内容连接成字符串，避免在f-string中直接使用可能包含反斜杠的内容
    docs_content = "\n\n".join([doc.page_content for doc in relevant_docs])
    
    if confidence > 0.7:
        strategy = "high_confidence_rag"
        prompt = """请基于以下上下文信息回答问题：

相关上下文：
{}

问题：{}

请基于上述上下文提供准确回答："""
        prompt = prompt.format(docs_content, question)
        
    elif confidence > 0.4:
        strategy = "balanced_hybrid" 
        prompt = """请基于以下上下文信息回答问题，同时可以适当结合你的知识进行补充：

相关上下文：
{}

问题：{}

请优先使用上下文信息，如果上下文信息不足可以结合你的知识进行补充："""
        prompt = prompt.format(docs_content, question)
        
    else:
        strategy = "model_primary"
        prompt = """请回答以下问题。我的知识库中有一些可能相关的信息，请主要基于你的知识回答，但可以参考这些信息：

可能相关的信息：
{}

问题：{}

请主要基于你的知识进行回答，如果知识库中的信息有帮助可以参考："""
        prompt = prompt.format(docs_content, question)
    
    return strategy, prompt

def init_vector_store(filepath=None, file_id=None, user_id=None, filename=None,ipfs_url=None):
    global vector_store

    if not filepath:
        if not vector_store and os.path.exists('chroma_db'):
            vector_store = Chroma(
                persist_directory='chroma_db',
                embedding_function=embeddings
            )
            count = vector_store._collection.count()
            print(f"成功加载本地知识库，共 {count} 条文档块")
        return

    try:
        # 处理Windows风格的路径分隔符
        filepath = filepath.replace('\\', '/')
        print(f"正在处理: {filepath}, 文件ID: {file_id}, 用户ID: {user_id}, 文件名: {filename}")

        if filepath.lower().endswith('.pdf'):
            loader = PyPDFLoader(filepath)
            documents = loader.load()
            print(f"PDF 加载成功，共 {len(documents)} 页")
        else:
            with open(filepath, "rb") as f:
                raw = f.read()
                detected = chardet.detect(raw)
                encoding = detected['encoding'] or 'utf-8'
            encoding = 'utf-16' if 'utf-16' in encoding.lower() else encoding
            encoding = 'gbk' if 'gb' in encoding.lower() else encoding
            try:
                loader = TextLoader(filepath, encoding=encoding)
                documents = loader.load()
                print(f"成功加载文本（{encoding}）: {len(documents)} 段")
            except:
                loader = TextLoader(filepath, encoding="utf-8", errors="ignore")
                documents = loader.load()

        cleaned_docs = []
        for doc in documents:
            text = doc.page_content.replace('\ufeff', '').replace('\u200b', '').replace('\u3000', ' ').replace('\xa0', ' ').strip()
            if not text:
                text = f"（空文档，来源：{os.path.basename(filepath)}）"
            doc.page_content = text
            
            # 🎯 修复：确保文件ID被正确存储
            # 如果file_id为None，从文件路径中提取
            if file_id is None:
                file_id_from_path = os.path.basename(filepath).split('.')[0]
                doc.metadata['file_id'] = file_id_from_path
                print(f"🔄 从文件路径提取file_id: {filepath} -> {file_id_from_path}")
            else:
                doc.metadata['file_id'] = file_id
            
            if user_id:
                doc.metadata['user_id'] = user_id
            if filename:
                doc.metadata['filename'] = filename

            doc.metadata['ipfs_url']=ipfs_url
            
            # 确保source也被正确设置
            doc.metadata['source'] = filepath
                
            cleaned_docs.append(doc)

        text_splitter = TokenTextSplitter(chunk_size=500, chunk_overlap=100)
        chunks = text_splitter.split_documents(cleaned_docs)
        if len(chunks) == 0:
            # 创建占位文档时也要设置file_id
            placeholder_metadata = {"source": filepath}
            if file_id:
                placeholder_metadata['file_id'] = file_id
            chunks = [Document(page_content="空文档占位", metadata=placeholder_metadata)]

        print(f"文档已切分为 {len(chunks)} 块")
        
        # 打印第一个块的metadata作为示例
        if chunks:
            print(f"示例文档块metadata: {chunks[0].metadata}")

        all_texts = [c.page_content for c in chunks]
        all_metadatas = [c.metadata for c in chunks]
        all_embeddings = []
        for i, text in enumerate(all_texts):
            embed_success = False
            for attempt in range(5):
                try:
                    embed = embeddings.embed_query(text)
                    all_embeddings.append(embed)
                    print(f"手动嵌入块 {i+1} 成功")
                    embed_success = True
                    break
                except Exception as e:
                    if "502" in str(e):
                        print(f"嵌入 502，重试块 {i+1} 第 {attempt+1} 次...")
                        time.sleep(5)
                    else:
                        raise
            if not embed_success:
                raise Exception(f"嵌入块 {i+1} 失败，5 次重试")

        if vector_store:
            vector_store.add_texts(
                texts=all_texts,
                embeddings=all_embeddings,
                metadatas=all_metadatas
            )
            print(f"文档已追加到知识库: {os.path.basename(filepath)}")
        else:
            class PrecomputedEmbeddings:
                def __init__(self, pre_embeds):
                    self.pre_embeds = pre_embeds

                def embed_documents(self, texts):
                    return self.pre_embeds

                def embed_query(self, text):
                    return self.pre_embeds[0]

            temp_embeddings = PrecomputedEmbeddings(all_embeddings)

            vector_store = Chroma.from_documents(
                documents=chunks,
                embedding=temp_embeddings,
                persist_directory='chroma_db'
            )
            print(f"手动新建知识库成功！文档数: {len(chunks)}")

        print(f"文件处理完成: {os.path.basename(filepath)}\n")

    except Exception as e:
        print(f"严重错误！文件处理彻底失败: {filepath}\n错误信息: {str(e)}")
        raise

def enhanced_record_transaction(tx_type, from_user, to_user, amount, file_owner=None, file_id=None, question=None, details=None):
    """增强的交易记录功能"""
    transactions = load_transactions()
    
    transaction = {
        'id': str(uuid.uuid4()),
        'type': tx_type,
        'from_user': from_user,
        'to_user': to_user,
        'amount': amount,
        'file_owner': file_owner,
        'file_id': file_id,
        'question': question,
        'details': details,  # 新增详细信息字段
        'timestamp': datetime.now().isoformat()
    }
    
    transactions.append(transaction)
    save_transactions(transactions)
    
    # 更新用户余额
    conn = get_db_connection()
    
    if from_user and tx_type == 'spend':
        conn.execute('''
        UPDATE users SET 
            coin_balance = coin_balance - ?,
            total_spent = total_spent + ?
        WHERE user_id = ?
        ''', (amount, amount, from_user))

    if to_user and tx_type == 'reward':
        conn.execute('''
        UPDATE users SET 
            coin_balance = coin_balance + ?,
            total_earned = total_earned + ?
        WHERE user_id = ?
        ''', (amount, amount, to_user))

    conn.commit()
    conn.close()
    
    # 记录详细日志
    log_transaction(transaction)

def log_transaction(transaction):
    """记录交易日志到文件"""
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'transaction': transaction
    }
    
    log_file = 'transaction_logs.json'
    logs = []
    
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        except:
            logs = []
    
    logs.append(log_entry)
    
    with open(log_file, 'w', encoding='utf-8') as f:
        json.dump(logs, f, ensure_ascii=False, indent=2)
# ==================== Flask 路由 ====================

# @app.route('/')
# def index():
#     if 'user_id' in session:
#         return redirect('/dashboard')
#     return render_template('index.html')

# @app.route('/login', methods=['GET', 'POST'])
# def login():
#     if request.method == 'POST':
#         # 支持表单数据和JSON数据
#         if request.is_json:
#             data = request.get_json()
#             user_id = data.get('username', '').strip()
#             password = data.get('password', '').strip()
#         else:
#             user_id = request.form.get('user_id', '').strip()
#             password = request.form.get('password', '').strip()
        
#         success, message = authenticate_user(user_id, password)
#         if success:
#             session['user_id'] = user_id
#             return jsonify({'success': True, 'message': message})
#         else:
#             return jsonify({'success': False, 'message': message})
    
#     return render_template('login.html')

# @app.route('/register', methods=['GET', 'POST'])
# def register():
#     if request.method == 'POST':
#         user_id = request.form.get('user_id', '').strip()
#         password = request.form.get('password', '').strip()
        
#         success, message = register_user(user_id, password)
#         if success:
#             session['user_id'] = user_id
#             return jsonify({'success': True, 'message': message})
#         else:
#             return jsonify({'success': False, 'message': message})
    
#     return render_template('register.html')

# @app.route('/logout')
# def logout():
#     session.pop('user_id', None)
#     return redirect('/')

# @app.route('/dashboard')
# def dashboard():
#     # if 'user_id' not in session:
#     #     return redirect('/login')
#     users = load_users()

#     wallet_address = request.form.get('wallet_address', '').strip()
#     print("wallet_address:", wallet_address)

#     # print("wallet_address:", wallet_address)

#     if wallet_address not in users:
#         return jsonify({'success': False, 'message': '钱包未注册，请先连接钱包'})
    
#     user_id = wallet_address
    
#     user_stats = get_user_status(user_id )
#     shared_files = search_files(user_id=wallet_address)
    
#     vector_count = vector_store._collection.count() if vector_store else 0
    
#     return render_template('dashboard.html', 
#                          user_id=wallet_address,
#                          stats=user_stats,
#                          files=shared_files,
#                          vector_count=vector_count)



@app.route('/share', methods=['POST'])
def share_file():

    users = load_users()

    wallet_address = request.form.get('wallet_address', '').strip()
    print("wallet_address:", wallet_address)

    # print("wallet_address:", wallet_address)

    if wallet_address not in users:
        return jsonify({'success': False, 'message': '钱包未注册，请先连接钱包'})
    
    user_id = wallet_address

    # if 'user_id' not in session:
    #     return jsonify({'success': False, 'message': '请先连接钱包'})
    # 为了测试，允许未登录用户使用默认测试账号
    # if 'user_id' not in session:
    #     # 使用默认测试账号
    #     user_id = 'test0'
    # else:
    #     user_id = session['user_id']
    
    filename = request.form.get('filename', '').strip()
    content = request.form.get('content', '').strip()
    authorize_rag = request.form.get('authorize_rag', 'false') == 'true'
    
    if not filename or not content:
        return jsonify({'success': False, 'message': '文件名和内容不能为空'})
    
    file_id = save_shared_file(user_id, filename, content, authorize_rag)
    
    return jsonify({
        'success': True, 
        'message': '文件分享成功',
        'file_id': file_id
    })



@app.route('/file_content/<file_id>')
def get_file_content(file_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': '请先登录'})
    
    files = load_files()
    if file_id not in files:
        return jsonify({'success': False, 'message': '文件不存在'})
    
    file_info = files[file_id]
    
    return jsonify({
        'success': True,
        'filename': file_info['filename'],
        'content': file_info['content'],
        'upload_time': file_info['upload_time'],
        'user_id': file_info['user_id'],
        'authorize_rag': file_info.get('authorize_rag', False),
        'reference_count': file_info.get('reference_count', 0),
        'total_reward': file_info.get('total_reward', 0)
    })

@app.route('/ask')
def ask_stream():

    users = load_users()
    wallet_address = request.args.get('wallet_address', '').strip()
    print("wallet_address:", wallet_address)

    if wallet_address not in users:
        return jsonify({'success': False, 'message': '钱包未注册，请先连接钱包'})
    
    user_id = wallet_address

    question = request.args.get('q', '').strip()
    
    print(f"用户 {user_id} 提问: {question}")
    
    if not question:
        return Response("data: 问题不能为空\n\n", mimetype='text/event-stream')
    
    # 检查用户余额
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)).fetchone()
    conn.close()
    
    if not user or user['coin_balance'] < 0.000001:
        return Response("data: Coin余额不足，请充值\n\n", mimetype='text/event-stream')
    
    def generate_response():
        should_use_rag = False
        rag_reason = ""
        confidence = 0.0
        relevant_docs = []
        
        try:
            conversation_cost = 0.000001
            record_transaction('spend', user_id, 'system', conversation_cost, None, None, question)
            
            # 从数据库获取最新余额
            conn = get_db_connection()
            user = conn.execute('SELECT * FROM users WHERE user_id = ?', (user_id,)).fetchone()
            conn.close()
            
            if user:
                current_balance = user['coin_balance']
                print(f"💰 本次对话消耗 {conversation_cost:.6f} coin，当前余额: {current_balance:.6f} coin")
            
            if not vector_store or vector_store._collection.count() == 0:
                print("知识库为空，直接基于模型知识回答...")
                try:
                    # 先发送一个测试消息
                    yield "data: 正在处理您的问题...\n\n"
                    
                    response = llm.invoke(question)
                    response_text = response.content if hasattr(response, 'content') else str(response)
                    print(f"LLM响应内容: {response_text[:50]}...")
                    
                    # 发送完整回答
                    yield f"data: {response_text}\n\n"
                    yield "data: [END]\n\n"
                except Exception as e:
                    import traceback
                    error_detail = traceback.format_exc()
                    print(f"LLM服务详细错误:\n{error_detail}")
                    yield f"data: LLM 服务错误: {str(e)}\n\n"
                    yield "data: [END]\n\n"
                return

            print("知识库已加载，开始检索相关文档...")
            
            retriever = vector_store.as_retriever(search_kwargs={"k": 10})
            all_docs = retriever.invoke(question)
            
            print(f"从知识库检索到 {len(all_docs)} 个文档块")
            
            if not all_docs:
                print("未找到相关文档，将基于模型知识回答")
                try:
                    response = llm.invoke(question)
                    response_text = response.content if hasattr(response, 'content') else str(response)
                    yield f"data: {response_text}\n\n"
                    yield "data: [END]\n\n"
                except Exception as e:
                    import traceback
                    error_detail = traceback.format_exc()
                    print(f"LLM服务详细错误:\n{error_detail}")
                    yield f"data: LLM 服务错误: {str(e)}\n\n"
                    yield "data: [END]\n\n"
                return
            
            try:
                print("开始智能过滤相关文档...")
                relevant_docs = adaptive_filter_relevant_docs(question, all_docs, embeddings, llm)
                print(f"过滤后保留 {len(relevant_docs)} 个相关文档")
            except Exception as e:
                print(f"智能过滤出错: {str(e)}，使用所有检索到的文档")
                relevant_docs = all_docs
            
            try:
                should_use_rag, rag_reason, confidence = intelligent_rag_decision(question, relevant_docs)
                print(f"{rag_reason} (置信度: {confidence:.2f})")
            except Exception as e:
                print(f"智能决策出错: {str(e)}，默认使用RAG")
                should_use_rag, rag_reason, confidence = True, "默认使用RAG", 0.5
            
            # 奖励分配信息只在后端显示
            if relevant_docs and should_use_rag:
                try:
                    print(f"开始奖励分配: 用户 {user_id}, 问题 '{question}', 相关文档 {len(relevant_docs)} 个")
                    reward_distribution = distribute_rewards(user_id, question, relevant_docs, conversation_cost)
                    
                    if reward_distribution:
                        print("奖励分配详情：")
                        total_distributed = 0
                        
                        for file_id, reward_info in reward_distribution.items():
                            files = load_files()
                            file_info = files.get(file_id, {})
                            filename = file_info.get('filename', '未知文件')
                            file_owner = file_info.get('user_id', '未知用户')
                            
                            reward_amount = reward_info['reward']
                            weight = reward_info['weight']
                            similarity = reward_info['similarity']
                            
                            total_distributed += reward_amount
                            
                            print(f"📄 {filename} (用户: {file_owner})")
                            print(f"    相似度: {similarity:.3f} | 权重: {weight:.3f} | 奖励: {reward_amount:.8f} coin")
                        
                        print(f"💰 总分配金额: {total_distributed:.8f} coin")
                    else:
                        print("⚠️ 没有进行奖励分配")
                        
                except Exception as e:
                    print(f"❌ 奖励分配出错: {e}")
            
            # 🎯 修复：优化AI回答生成部分
            if should_use_rag and relevant_docs:
                try:
                    strategy, hybrid_prompt = hybrid_answering_strategy(question, relevant_docs, confidence)
                    print(f"使用回答策略: {strategy}")

                    unique_sources = {}
                    for doc in relevant_docs:
                        src = doc.metadata.get("source", "未知文件")
                        filename = os.path.basename(src)
                        # 🎯 修改：去掉文件扩展名，只显示文件名
                        filename_without_ext = os.path.splitext(filename)[0]
                        page = doc.metadata.get("page")
                        ipfs_url = doc.metadata.get("ipfs_url")
                        similarity = doc.metadata.get('semantic_similarity', 0)
                        
                        if filename not in unique_sources:
                            display_name = f"《{filename_without_ext}》"
                            display_name += f"ipfs_url:{ipfs_url}"
                            if page is not None:
                                display_name += f" (第 {page + 1} 页)"
                            display_name += f" [相关度:{similarity:.2f}]"
                            
                            unique_sources[filename] = {
                                'display': display_name,
                                'similarity': similarity
                            }
                    
                    # 发送相关文档信息到前端
                    if unique_sources:
                        yield "data: 📚 本次回答参考了以下文档：\n\n"
                        sorted_sources = sorted(unique_sources.values(), key=lambda x: x['similarity'], reverse=True)
                        for i, info in enumerate(sorted_sources):
                            yield f"data: {i+1}. {info['display']}\n"
                        yield "data: \n\n"
                    
                    print("正在生成回答...")
                    
                    # 🎯 修复：添加超时保护和错误处理
                    try:
                        # 设置生成回答的超时时间
                        import threading
                        from queue import Queue, Empty
                        
                        response_queue = Queue()
                        error_queue = Queue()
                        
                        def generate_ai_response():
                            try:
                                response = llm.invoke(hybrid_prompt)
                                response_text = response.content if hasattr(response, 'content') else str(response)
                                response_queue.put(response_text)
                            except Exception as e:
                                error_queue.put(str(e))
                        
                        # 在单独的线程中生成回答
                        thread = threading.Thread(target=generate_ai_response)
                        thread.daemon = True
                        thread.start()
                        
                        # 等待回答生成，最多等待60秒
                        thread.join(timeout=60)
                        
                        if thread.is_alive():
                            # 如果超时，发送超时信息
                            yield "data: ⏰ 生成回答超时，请重试\n\n"
                        elif not error_queue.empty():
                            # 如果有错误，发送错误信息
                            error_msg = error_queue.get()
                            yield f"data: 生成回答时出错: {error_msg}\n\n"
                        else:
                            # 成功生成回答
                            response_text = response_queue.get()
                            yield f"data: {response_text}\n\n"
                            
                    except Exception as e:
                        print(f"AI回答生成异常: {e}")
                        yield f"data: 生成回答时出现异常: {str(e)}\n\n"
                        # 尝试简化回答
                        try:
                            simple_response = llm.invoke(f"请简单回答：{question}")
                            simple_text = simple_response.content if hasattr(simple_response, 'content') else str(simple_response)
                            yield f"data: 简化回答: {simple_text}\n\n"
                        except:
                            yield "data: 无法生成回答，请重试\n\n"
                    
                except Exception as e:
                    print(f"回答策略出错: {e}")
                    yield f"data: 回答策略出错: {str(e)}\n\n"

# ==================== 在 app.py 的 ask_stream 函数中找到模型自身知识回答部分 ====================

# 替换这个 else 分支（模型自身知识回答部分）
            # ==================== 替代方案：合并回答和提示信息 ====================

            else:
                print("将基于模型自身知识进行回答...")
                try:
                    enhanced_prompt = f"请回答以下问题：{question}"
                    
                    response = llm.invoke(enhanced_prompt)
                    response_text = response.content if hasattr(response, 'content') else str(response)
                    
                    # 🎯 修复：直接在回答内容中添加提示信息
                    full_response = response_text + "\n\n---\n\n💡 **本次回答基于模型的训练知识**"
                    
                    # 模拟流式输出
                    import time
                    words = full_response.split(' ')
                    current_chunk = ""
                    
                    for i, word in enumerate(words):
                        current_chunk += word + " "
                        # 每4个单词或到达末尾时发送一次
                        if i % 4 == 0 or i == len(words) - 1:
                            yield f"data: {current_chunk}\n\n"
                            current_chunk = ""
                            time.sleep(0.03)  # 轻微延迟以模拟流式效果
                    
                    yield "data: [END]\n\n"
                    
                except Exception as e:
                    yield f"data: 生成回答时出错: {str(e)}\n\n"
                    yield "data: [END]\n\n"
            yield "data: [END]\n\n"

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            print(f"AI对话错误详情: {error_details}")
            yield f"data: 系统错误: {str(e)}\n\n"
            yield "data: [END]\n\n"

    return Response(generate_response(), mimetype='text/event-stream')


@app.route('/community')
def community():
    if 'user_id' not in session:
        return redirect('/login')
    
    files = search_files()
    return render_template('community.html', files=files, session=session)

@app.route('/file_detail/<file_id>')
def file_detail(file_id):
    if 'user_id' not in session:
        return redirect('/login')
    
    files = load_files()
    if file_id not in files:
        return "文件不存在", 404
    
    file_info = files[file_id]
    
    return render_template('file_detail.html', 
                         file_info=file_info,
                         user_id=session['user_id'])

@app.route('/vector_status')
def vector_status():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': '请先登录'})
    
    if not vector_store:
        return jsonify({
            'success': True,
            'vector_count': 0,
            'status': '未初始化'
        })
    
    count = vector_store._collection.count()
    return jsonify({
        'success': True,
        'vector_count': count,
        'status': f'已加载 {count} 个文档块'
    })

def add_content_to_vector_store(content, file_id, user_id, filename,ipfs_url):
    global vector_store
    
    try:
        from langchain_core.documents import Document
        
        # 创建Document对象
        doc = Document(
            page_content=content,
            metadata={
                'file_id': file_id,
                'user_id': user_id,
                'filename': filename,
                'source': filename,
                'ipfs_url':ipfs_url
            }
        )
        
        # 分割文档
        text_splitter = TokenTextSplitter(chunk_size=500, chunk_overlap=100)
        docs = text_splitter.split_documents([doc])
        
        # 初始化或添加到向量库
        if vector_store is None:
            vector_store = Chroma.from_documents(
                documents=docs,
                embedding=embeddings,
                persist_directory='chroma_db'
            )
        else:
            vector_store.add_documents(docs)
        
        print(f"成功添加内容到向量库: {filename} (共 {len(docs)} 块)")
    except Exception as e:
        print(f"添加内容到向量库失败: {e}")
        raise

@app.route('/reload_vector_store')
def reload_vector_store():
    # 为了测试，允许未登录用户使用默认测试账号
    if 'user_id' not in session:
        # 使用默认测试账号
        user_id = 'test0'
    else:
        user_id = session['user_id']
    
    try:
        global vector_store
        
        files = load_files()
        authorized_files_count = 0
        
        # 清理旧的向量库
        import shutil
        if os.path.exists('chroma_db'):
            shutil.rmtree('chroma_db')
        vector_store = None
        
        # 重新加载所有授权的文件
        for file_id, file_info in files.items():
            if file_info.get('authorize_rag', False):
                # 优先使用content字段直接加载
                content = file_info.get('content')
                user_id = file_info.get('user_id')
                filename = file_info.get('filename')
                ipfs_url= file_info.get('ipfs_url')
                
                if content and file_id:
                    try:
                        add_content_to_vector_store(content, file_id, user_id, filename,ipfs_url)
                        authorized_files_count += 1
                        print(f"通过content加载文件到知识库: {filename} (ID: {file_id})")
                    except Exception as e:
                        print(f"content加载失败 {filename}: {e}")
                else:
                    # 回退到file_path加载
                    file_path = file_info.get('file_path')
                    if file_path:
                        # 转换Windows路径
                        file_path = file_path.replace('\\', '/')
                        # 确保是绝对路径
                        if not os.path.isabs(file_path):
                            file_path = os.path.join(os.getcwd(), file_path)
                        
                        if os.path.exists(file_path):
                            try:
                                add_file_to_vector_store(file_path, file_id, user_id, filename,ipfs_url)
                                authorized_files_count += 1
                                print(f"通过file_path加载文件到知识库: {filename} (ID: {file_id})")
                            except Exception as e:
                                print(f"file_path加载失败 {filename}: {e}")
        
        final_count = vector_store._collection.count() if vector_store else 0
        
        return jsonify({
            'success': True,
            'message': f'知识库重新加载完成，共 {authorized_files_count} 个授权文件，{final_count} 个文档块',
            'vector_count': final_count,
            'loaded_files': authorized_files_count
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'重新加载知识库失败: {str(e)}'
        })

    
@app.route('/health')
def health_check():
    # 获取用户数量
    conn = get_db_connection()
    user_count = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    conn.close()
    
    status = {
        "ollama_status": "unknown",
        "embedding_model": "unknown", 
        "llm_model": "unknown",
        "vector_store": "empty" if not vector_store else f"loaded ({vector_store._collection.count()} docs)",
        "user_count": user_count,
        "file_count": len(load_files())
    }
    
    try:
        test_embed = embeddings.embed_query("test")
        status["embedding_model"] = "ok"
        
        test_response = llm.invoke("hello")
        status["llm_model"] = "ok"
        status["ollama_status"] = "running"
        
    except Exception as e:
        status["ollama_status"] = f"error: {str(e)}"
    
    return jsonify(status)

@app.route('/files')
@app.route('/api/files')
def list_files():
    # 支持两种认证方式：session和wallet_address参数
    user_id = None
    
    # 检查session
    if 'user_id' in session:
        user_id = session['user_id']
    
    # 如果session中没有用户ID，检查wallet_address参数
    if not user_id:
        wallet_address = request.args.get('wallet_address', '').strip()
        if wallet_address:
            user_id = wallet_address
    
    if not user_id:
        return jsonify({'success': False, 'message': '请先登录'})
    
    keyword = request.args.get('keyword', '').strip()
    file_id = request.args.get('file_id', '').strip()
    
    # 🎯 优化搜索逻辑
    files = search_files(file_id=file_id if file_id else None, keyword=keyword)
    
    print(f"🔍 搜索请求 - 关键词: '{keyword}', 文件ID: '{file_id}', 结果数量: {len(files)}")
    
    return jsonify({
        'success': True,
        'files': files,
        'count': len(files)
    })

def search_files(file_id=None, user_id=None, keyword=None):
    """优化文件搜索功能"""
    files = load_files()
    results = []
    
    print(f"🔍 搜索文件 - file_id: {file_id}, user_id: {user_id}, keyword: {keyword}")
    
    for fid, file_info in files.items():
        match = True
        
        if file_id and fid != file_id:
            match = False
        if user_id and file_info['user_id'] != user_id:
            match = False
        if keyword:
            keyword_lower = keyword.lower()
            # 🎯 优化：在文件名和内容中搜索，提高搜索准确性
            filename_match = keyword_lower in file_info['filename'].lower()
            content_match = keyword_lower in file_info['content'].lower()
            file_id_match = keyword_lower in fid.lower()
            user_id_match = keyword_lower in file_info['user_id'].lower()
            
            if not (filename_match or content_match or file_id_match or user_id_match):
                match = False
                
        if match:
            results.append({
                'file_id': fid,
                **file_info
            })
    
    # 按上传时间倒序排列
    sorted_results = sorted(results, key=lambda x: x['upload_time'], reverse=True)
    
    print(f"✅ 搜索完成，找到 {len(sorted_results)} 个文件")
    return sorted_results

@app.route('/community/files', methods=['GET'])
def get_community_files():
    """获取社区所有文件或搜索文件"""
    try:
        print("📥 收到社区文件请求")
        
        # 获取搜索关键词
        keyword = request.args.get('keyword', '').strip()
        print(f"🔍 搜索关键词: '{keyword}'")
        
        # 加载文件数据
        files = load_files()
        
        if not files:
            print("⚠️ files.json为空或不存在")
            return jsonify({
                'success': True,
                'message': '暂无文件数据',
                'files': [],
                'total_count': 0
            })
        
        # 处理文件数据
        file_list = []
        
        if keyword:
            # 执行搜索
            print(f"🔍 开始搜索，关键词: {keyword}")
            search_results = search_files_in_content(files, keyword)
            print(f"✅ 找到 {len(search_results)} 个匹配文件")
            
            for file_id in search_results:
                file_data = files[file_id]
                file_list.append({
                    'file_id': file_id,
                    'filename': file_data.get('filename', ''),
                    'user_id': file_data.get('user_id', ''),
                    'content': file_data.get('content_preview', file_data.get('content', '')),
                    'content_full': file_data.get('content', ''),
                    'upload_time': file_data.get('upload_time', ''),
                    'reference_count': file_data.get('reference_count', 0),
                    'total_reward': file_data.get('total_reward', 0.0),
                    'authorize_rag': file_data.get('authorize_rag', False),
                    'ipfs_url': file_data.get('ipfs_url', '')
                })
        else:
            # 返回所有文件
            print(f"📂 返回所有文件，共 {len(files)} 个")
            for file_id, file_data in files.items():
                file_list.append({
                    'file_id': file_id,
                    'filename': file_data.get('filename', ''),
                    'user_id': file_data.get('user_id', ''),
                    'content': file_data.get('content_preview', file_data.get('content', '')),
                    'content_full': file_data.get('content', ''),
                    'upload_time': file_data.get('upload_time', ''),
                    'reference_count': file_data.get('reference_count', 0),
                    'total_reward': file_data.get('total_reward', 0.0),
                    'authorize_rag': file_data.get('authorize_rag', False),
                    'ipfs_url': file_data.get('ipfs_url', '')
                })
        
        # 按上传时间倒序排序
        file_list.sort(key=lambda x: x.get('upload_time', ''), reverse=True)
        
        print(f"✅ 返回 {len(file_list)} 个文件")
        return jsonify({
            'success': True,
            'message': '文件数据获取成功',
            'files': file_list,
            'total_count': len(file_list)
        })
        
    except Exception as e:
        print(f"❌ 获取社区文件时发生错误: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': f'服务器错误: {str(e)}',
            'files': [],
            'total_count': 0
        }), 500

@app.route('/community/file/<file_id>', methods=['GET'])
def get_file_detail(file_id):
    """获取单个文件的详细信息"""
    try:
        print(f"📥 获取文件详情，文件ID: {file_id}")
        
        # 加载文件数据
        files = load_files()
        
        if not files:
            print("⚠️ files.json为空或不存在")
            return jsonify({
                'success': False,
                'message': '文件数据库为空'
            }), 404
        
        if file_id not in files:
            print(f"❌ 文件不存在: {file_id}")
            return jsonify({
                'success': False,
                'message': '文件不存在'
            }), 404
        
        file_data = files[file_id]
        
        # 获取用户信息（如果需要）
        user_id = file_data.get('user_id', '')
        
        print(f"✅ 找到文件: {file_data.get('filename')}")
        return jsonify({
            'success': True,
            'message': '文件详情获取成功',
            'file_info': {
                'file_id': file_id,
                'filename': file_data.get('filename', ''),
                'user_id': user_id,
                'content': file_data.get('content', ''),
                'content_preview': file_data.get('content_preview', ''),
                'upload_time': file_data.get('upload_time', ''),
                'reference_count': file_data.get('reference_count', 0),
                'total_reward': file_data.get('total_reward', 0.0),
                'authorize_rag': file_data.get('authorize_rag', False),
                'ipfs_url': file_data.get('ipfs_url', ''),
                'file_path': file_data.get('file_path', '')
            }
        })
        
    except Exception as e:
        print(f"❌ 获取文件详情时发生错误: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': f'服务器错误: {str(e)}'
        }), 500

@app.route('/community/stats', methods=['GET'])
def get_community_stats():
    """获取社区统计信息"""
    try:
        print("📊 获取社区统计信息")
        
        files = load_files()
        
        if not files:
            print("⚠️ files.json为空或不存在")
            return jsonify({
                'success': True,
                'message': '暂无统计信息',
                'stats': {
                    'total_files': 0,
                    'total_references': 0,
                    'total_rewards': 0.0,
                    'active_authors': 0
                }
            })
        
        # 计算统计数据
        total_files = len(files)
        total_references = sum(f.get('reference_count', 0) for f in files.values())
        total_rewards = sum(f.get('total_reward', 0.0) for f in files.values())
        
        # 统计活跃作者
        authors = set()
        for file_data in files.values():
            authors.add(file_data.get('user_id', ''))
        active_authors = len(authors)
        
        print(f"📊 社区统计: 文件={total_files}, 引用={total_references}, 收益={total_rewards}, 作者={active_authors}")
        
        return jsonify({
            'success': True,
            'message': '统计信息获取成功',
            'stats': {
                'total_files': total_files,
                'total_references': total_references,
                'total_rewards': total_rewards,
                'active_authors': active_authors
            }
        })
        
    except Exception as e:
        print(f"❌ 获取社区统计时发生错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器错误: {str(e)}'
        }), 500


# WebSocket事件处理
@socketio.on('connect', namespace='/ws')
def handle_connect():
    """处理WebSocket连接事件"""
    print("客户端已连接到WebSocket")
    emit('system_message', {'type': 'info', 'content': '后端WebSocket连接成功'})


@app.route('/api/test_system_message', methods=['GET'])
def test_system_message():
    """测试接口：发送系统消息"""
    message_content = request.args.get('content', '这是一条测试系统消息')
    message_type = request.args.get('type', 'info')
    
    # 验证消息类型
    valid_types = ['info', 'success', 'warning', 'error']
    if message_type not in valid_types:
        message_type = 'info'
    
    send_system_message(message_type, message_content)
    return jsonify({'success': True, 'message': '系统消息已发送'})


def send_system_message(message_type, content):
    """发送系统消息给所有连接的客户端"""
    socketio.emit('system_message', {
        'type': message_type,
        'content': content
    }, namespace='/ws')
    print(f"发送系统消息: [{message_type}] {content}")


@app.route('/api/test_intent', methods=['GET'])
def test_intent():
    """测试发送转账意图JSON消息"""
    try:
        # 模拟的转账意图JSON数据
        intent_data = {
            'action': 'transfer',
            'fromChain': 'zetachain',
            'toChain': 'zetachain',
            'fromToken': 'ZETA',
            'toToken': 'ZETA',
            'amount': '0.01',
            'recipient': '0xeb2eb574be8001ef7ff3c60bd56caac4ed58fab2'
        }
        
        # 发送包含转账意图的系统消息
        socketio.emit('system_message', {
            'type': 'info',
            'content': f'收到转账请求：{intent_data["amount"]} {intent_data["fromToken"]} 到 {intent_data["recipient"]}',
            **intent_data
        }, namespace='/ws')
        
        return jsonify({'status': 'success', 'message': '转账意图消息已发送'}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/test_qwen_api', methods=['GET'])
def test_qwen_api_route():
    """测试Qwen API连接"""
    try:
        test_question = "测试Qwen API连接"
        print(f"测试Qwen API: {test_question}")
        
        # 直接调用Qwen API
        response = llm.invoke(test_question)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        print(f"Qwen API测试成功: {response_text}")
        return jsonify({'status': 'success', 'message': response_text}), 200
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Qwen API测试失败:\n{error_detail}")
        return jsonify({'status': 'error', 'message': str(e), 'detail': error_detail}), 500

@app.route('/api/test_simple_ask', methods=['GET'])
def test_simple_ask():
    """测试简单的LLM调用（非SSE）"""
    try:
        question = request.args.get('q', '为什么人类需要爱？')
        print(f"测试简单提问: {question}")
        
        # 直接调用Qwen API
        response = llm.invoke(question)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        print(f"简单提问测试成功: {response_text}")
        return jsonify({'status': 'success', 'question': question, 'answer': response_text}), 200
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"简单提问测试失败:\n{error_detail}")
        return jsonify({'status': 'error', 'message': str(e), 'detail': error_detail}), 500


@app.route('/dashboard', methods=['GET'])
@app.route('/api/dashboard', methods=['GET'])
def get_dashboard_data():
    """获取仪表盘数据 - 同时支持 /dashboard 和 /api/dashboard 路径"""
    wallet_address = request.args.get('wallet_address', '').strip()
    
    print(f"📊 Dashboard API 调用，钱包地址: {wallet_address}")
    
    if not wallet_address:
        print("⚠️ 钱包地址为空")
        return jsonify({'success': False, 'message': '钱包地址不能为空'})
    
    # 从JSON文件加载数据
    users = load_users()
    
    print(f"🔍 检查用户是否存在，钱包地址: {wallet_address}")
    print(f"📁 用户列表中的用户: {list(users.keys())}")
    
    # 检查用户是否存在
    if wallet_address not in users:
        # 检查是否作为wallet_account存在
        user_found = False
        user_id = None
        for uid, user_data in users.items():
            if user_data.get('wallet_account') == wallet_address:
                user_found = True
                user_id = uid
                print(f"✅ 通过wallet_account找到用户: {uid}")
                break
        
        if not user_found:
            print(f"❌ 用户不存在于users.json: {wallet_address}")
            return jsonify({'success': False, 'message': '钱包未注册，请先连接钱包'})
    else:
        user_id = wallet_address
        print(f"✅ 用户ID直接匹配: {user_id}")
    
    user_data = users[user_id]
    
    # 计算统计数据
    # 1. 总收益 - 直接从users.json获取
    total_earned = user_data.get('total_earned', 0.0)
    print(f"💰 总收益: {total_earned}")
    
    # 2. Data NFT数量（上传的文件数量）
    data_nft_count = len(user_data.get('uploaded_files', []))
    print(f"📁 Data NFT数量: {data_nft_count}")
    
    # 3. AI调用次数（今日引用次数）
    transactions = load_transactions()
    today = datetime.now().date()
    
    ai_calls_today = 0
    for tx in transactions:
        tx_time = datetime.fromisoformat(tx['timestamp']).date()
        if tx_time == today and tx.get('file_owner') == user_id and tx['type'] == 'reference':
            ai_calls_today += 1
    
    print(f"🤖 今日AI调用次数: {ai_calls_today}")
    
    # 4. 本月增长（本月收益）
    current_month = datetime.now().strftime('%Y-%m')
    monthly_growth = 0.0
    
    for tx in transactions:
        if tx['type'] == 'reward' and tx['to_user'] == user_id:
            tx_time = datetime.fromisoformat(tx['timestamp'])
            if tx_time.strftime('%Y-%m') == current_month:
                monthly_growth += tx['amount']
    
    print(f"📈 本月增长: {monthly_growth}")
    
    # 获取最近活动（交易记录）
    recent_activity = []
    user_transactions = []
    
    for tx in transactions:
        if tx['from_user'] == user_id or tx['to_user'] == user_id or tx.get('file_owner') == user_id:
            user_transactions.append(tx)
    
    # 按时间倒序排列，取最近5条
    user_transactions.sort(key=lambda x: x['timestamp'], reverse=True)
    
    for i, tx in enumerate(user_transactions[:5]):
        activity_type = ""
        content = ""
        
        if tx['type'] == 'reward' and tx['to_user'] == user_id:
            activity_type = "收益"
            content = f"AI 模型调用收益 +{tx['amount']:.6f} USDT"
        elif tx['type'] == 'spend' and tx['from_user'] == user_id:
            activity_type = "支出"
            content = f"AI 提问支出 -{tx['amount']:.6f} USDT"
        elif tx['type'] == 'reference' and tx.get('file_owner') == user_id:
            activity_type = "引用"
            content = f"您的内容被 AI 引用"
        elif tx['type'] == 'reward' and tx.get('file_owner') == user_id:
            activity_type = "收益"
            content = f"数据授权收益 +{tx['amount']:.6f} USDT"
        
        if activity_type:
            # 计算相对时间
            tx_time = datetime.fromisoformat(tx['timestamp'])
            now = datetime.now()
            time_diff = now - tx_time
            
            if time_diff.total_seconds() < 3600:
                time_str = f"{int(time_diff.total_seconds() / 60)}分钟前"
            elif time_diff.total_seconds() < 86400:
                time_str = f"{int(time_diff.total_seconds() / 3600)}小时前"
            else:
                time_str = f"{int(time_diff.total_seconds() / 86400)}天前"
            
            recent_activity.append({
                'id': i + 1,
                'type': activity_type,
                'content': content,
                'time': time_str,
                'timestamp': tx['timestamp']
            })
    
    # 获取内容溯源（用户上传的文件信息）
    files = load_files()
    content_tracing = []
    
    uploaded_file_ids = user_data.get('uploaded_files', [])
    print(f"📄 用户上传的文件ID: {uploaded_file_ids}")
    
    for file_id in uploaded_file_ids[:5]:  # 只取前5个文件
        if file_id in files:
            file_info = files[file_id]
            content_tracing.append({
                'file_id': file_id,
                'filename': file_info['filename'],
                'reference_count': file_info.get('reference_count', 0),
                'total_reward': file_info.get('total_reward', 0.0),
                'content_preview': file_info.get('content_preview', ''),
                'ipfs_url': file_info.get('ipfs_url', ''),
                'authorize_rag': file_info.get('authorize_rag', False)
            })
        else:
            print(f"⚠️ 文件不存在: {file_id}")
    
    print(f"✅ 数据准备完成，返回给前端")
    
    # 格式化数据
    return jsonify({
        'success': True,
        'message': '数据获取成功',
        'data': {
            'stats': {
                'total_earned': {
                    'label': '总收益',
                    'value': f"{total_earned:.6f} USDT",
                    'raw_value': total_earned
                },
                'data_nft': {
                    'label': 'Data NFT',
                    'value': str(data_nft_count),
                    'raw_value': data_nft_count
                },
                'ai_calls': {
                    'label': 'AI 调用次数',
                    'value': str(ai_calls_today),
                    'raw_value': ai_calls_today
                },
                'monthly_growth': {
                    'label': '本月增长',
                    'value': f"+{monthly_growth:.6f} USDT" if monthly_growth > 0 else f"{monthly_growth:.6f} USDT",
                    'raw_value': monthly_growth
                }
            },
            'recent_activity': recent_activity,
            'content_tracing': content_tracing,
            'user_info': {
                'user_id': user_id,
                'wallet_address': user_data.get('wallet_account', user_id),
                'coin_balance': user_data.get('coin_balance', 0.0),
                'total_earned': user_data.get('total_earned', 0.0),
                'total_spent': user_data.get('total_spent', 0.0)
            }
        }
    })



@app.route('/dashboard', methods=['GET'])
def dashboard_api():
    """Dashboard API - 用于代理转发的路由"""
    # 这里直接调用 get_dashboard_data 函数
    return get_dashboard_data()

@app.route('/api/user/stats', methods=['GET'])
def get_user_stats_api():
    """获取用户统计信息（简化版）- 只使用JSON文件"""
    wallet_address = request.args.get('wallet_address', '').strip()
    
    if not wallet_address:
        return jsonify({'success': False, 'message': '钱包地址不能为空'})
    
    # 从JSON文件加载数据
    users = load_users()
    
    # 检查用户是否存在
    if wallet_address not in users:
        # 检查是否作为wallet_account存在
        user_found = False
        user_id = None
        for uid, user_data in users.items():
            if user_data.get('wallet_account') == wallet_address:
                user_found = True
                user_id = uid
                break
        
        if not user_found:
            return jsonify({'success': False, 'message': '用户不存在'})
    else:
        user_id = wallet_address
    
    user_data = users[user_id]
    
    # 获取今日收益和引用
    today = datetime.now().date()
    transactions = load_transactions()
    
    today_earned = 0.0
    today_references = 0
    
    for tx in transactions:
        tx_time = datetime.fromisoformat(tx['timestamp']).date()
        if tx_time == today:
            if tx['type'] == 'reward' and tx['to_user'] == user_id:
                today_earned += tx['amount']
            elif tx['type'] == 'reference' and tx.get('file_owner') == user_id:
                today_references += 1
    
    # 获取上传文件数量
    uploaded_files_count = len(user_data.get('uploaded_files', []))
    
    return jsonify({
        'success': True,
        'data': {
            'coin_balance': user_data.get('coin_balance', 0.0),
            'total_earned': user_data.get('total_earned', 0.0),
            'total_spent': user_data.get('total_spent', 0.0),
            'today_earned': today_earned,
            'today_references': today_references,
            'uploaded_files_count': uploaded_files_count,
            'wallet_address': user_data.get('wallet_account', user_id)
        }
    })


@app.route('/stake', methods=['POST'])
def handle_stake():
    """处理质押信息的写入"""
    try:
        # 解析请求体
        data = request.get_json()
        
        # 验证必要字段
        required_fields = ['file_id', 'wallet_address', 'amount', 'content_id']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({'success': False, 'message': f'{field}字段不能为空'})
        
        file_id = data['file_id']
        wallet_address = data['wallet_address']
        amount = float(data['amount'])
        content_id = data['content_id']
        
        # 写入数据库
        conn = get_db_connection()
        conn.execute('''
        INSERT INTO stakes (file_id, wallet_address, amount, content_id)
        VALUES (?, ?, ?, ?)
        ''', (file_id, wallet_address, amount, content_id))
        conn.commit()
        conn.close()
        
        # 更新数据库中的files表的total_staked字段
        conn = get_db_connection()
        conn.execute('''
        UPDATE files 
        SET total_staked = total_staked + ? 
        WHERE id = ?
        ''', (amount, file_id))
        conn.commit()
        conn.close()
        
        # 同时更新JSON文件以保持兼容性
        files = load_files()
        if file_id in files:
            files[file_id]['total_staked'] = files[file_id].get('total_staked', 0) + amount
            save_files(files)
        
        return jsonify({
            'success': True,
            'message': '质押信息已成功写入数据库'
        })
    
    except json.JSONDecodeError:
        return jsonify({'success': False, 'message': '请求体不是有效的JSON格式'})
    except ValueError:
        return jsonify({'success': False, 'message': 'amount字段必须是有效的数字'})
    except Exception as e:
        print(f"处理质押请求时出错: {str(e)}")
        return jsonify({'success': False, 'message': f'服务器错误: {str(e)}'})


@app.route('/stake', methods=['GET'])
def get_stakes():
    """获取质押记录"""
    try:
        # 获取查询参数
        wallet_address = request.args.get('wallet_address', '').strip()
        file_id = request.args.get('file_id', '').strip()
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 构建查询语句，关联files表获取文件名
        query = """
            SELECT 
                t2.filename, 
                t1.amount, 
                t1.stake_time, 
                t1.id, 
                t1.file_id, 
                t1.wallet_address, 
                t1.content_id
            FROM stakes t1 
            LEFT JOIN files t2 ON t1.file_id = t2.id 
            WHERE 1=1
        """
        params = []
        
        if wallet_address:
            query += " AND t1.wallet_address = ?"
            params.append(wallet_address)               
        
        # 按时间倒序排列
        query += " ORDER BY t1.stake_time DESC"

        print(query, params)
        
        cursor.execute(query, params)
        stakes = cursor.fetchall()
        conn.close()
        
        for stake in stakes:
            print(stake)

        # 转换为字典列表
        stake_list = []
        for stake in stakes:
            stake_list.append({
                'id': stake['id'],
                'file_id': stake['file_id'],
                'wallet_address': stake['wallet_address'],
                'amount': stake['amount'],
                'content_id': stake['content_id'],
                'stake_time': stake['stake_time'],
                'filename': stake['filename']  # 新增文件名字段
            })
        
        return jsonify({
            'success': True,
            'stakes': stake_list,
            'count': len(stake_list)
        })
    
    except Exception as e:
        print(f"获取质押记录时出错: {str(e)}")
        return jsonify({'success': False, 'message': f'服务器错误: {str(e)}'})



if __name__ == '__main__':
    print("🚀 启动多用户AI知识库平台...")
    print("📚 初始化向量库...")
    init_vector_store()
    
    if vector_store:
        try:
            count = vector_store._collection.count()
            print(f"✅ 向量库加载成功，包含 {count} 个文档")
        except Exception as e:
            print(f"❌ 向量库访问错误: {e}")
    else:
        print("⚠️  向量库未加载，知识库为空")
    
    # 发送启动消息
    print("🌐 正在启动服务器...")
    
    # 使用socketio.run()替代app.run()以支持WebSocket
    socketio.run(app, host='127.0.0.1', port=5001, debug=True)
