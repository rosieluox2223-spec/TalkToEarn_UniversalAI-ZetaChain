import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs/promises';

// 主函数
async function importFilesToDB() {
  try {
    // 1. 读取 files.json 文件
    console.log('🔍 正在读取 files.json 文件...');
    const filesJson = await fs.readFile('/Users/dahai/talktoearn/TalkToEarn_UniversalAI-ZetaChain/files.json', 'utf8');
    const filesData = JSON.parse(filesJson);
    
    // 2. 连接 SQLite 数据库（如果不存在则创建）
    console.log('📦 正在连接 SQLite 数据库...');
    const db = await open({
      filename: '/Users/dahai/talktoearn/TalkToEarn_UniversalAI-ZetaChain/files.db',
      driver: sqlite3.Database
    });
    
    // 3. 创建文件表
    console.log('🗄️  正在创建 files 表...');
    await db.exec(`
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
        ipfs_url TEXT
      );
    `);
    
    // 4. 清空表（如果需要）
    // await db.run('DELETE FROM files');
    
    // 5. 插入数据
    console.log('📥 正在插入数据...');
    const insertStmt = await db.prepare(`
      INSERT OR REPLACE INTO files (
        id, filename, user_id, content, content_preview, upload_time,
        authorize_rag, reference_count, total_reward, file_path, ipfs_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let count = 0;
    for (const [id, fileInfo] of Object.entries(filesData)) {
      await insertStmt.run(
        id,
        fileInfo.filename,
        fileInfo.user_id,
        fileInfo.content,
        fileInfo.content_preview,
        fileInfo.upload_time,
        fileInfo.authorize_rag ? 1 : 0,
        fileInfo.reference_count,
        fileInfo.total_reward,
        fileInfo.file_path,
        fileInfo.ipfs_url
      );
      count++;
      console.log(`✅ 已插入文件: ${fileInfo.filename} (${id})`);
    }
    
    await insertStmt.finalize();
    
    // 6. 查询数据以验证
    const result = await db.all('SELECT COUNT(*) as total FROM files');
    console.log(`\n📊 导入完成！数据库中共有 ${result[0].total} 条记录`);
    
    // 7. 关闭数据库连接
    await db.close();
    console.log('🔒 数据库连接已关闭');
    
  } catch (error) {
    console.error('❌ 导入过程中发生错误:', error);
    process.exit(1);
  }
}

// 执行函数
importFilesToDB();
