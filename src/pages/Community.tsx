// src/pages/Community.tsx
import { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { 
  Search, 
  FileText, 
  Users, 
  TrendingUp, 
  Coins, 
  ExternalLink,
  Calendar,
  User,
  Hash,
  AlertCircle,
  Loader2,
  RefreshCw,
  Filter
} from "lucide-react";

interface FileInfo {
  file_id: string;
  filename: string;
  user_id: string;
  content: string;
  content_full?: string;
  upload_time: string;
  reference_count: number;
  total_reward: number;
  authorize_rag: boolean;
  ipfs_url: string;
}

interface CommunityStats {
  total_files: number;
  total_references: number;
  total_rewards: number;
  active_authors: number;
}

const Community = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const { toast } = useToast();

  // 获取社区文件列表
  const fetchCommunityFiles = async (keyword = '') => {
    try {
      console.log("🔍 开始获取社区文件...");
      
      // 测试代理是否工作
      const testUrl = keyword 
        ? `/api/community/files?keyword=${encodeURIComponent(keyword)}`
        : '/api/community/files';
      
      console.log("🌐 前端请求URL:", testUrl);
      console.log("📡 预期代理到后端:", `http://localhost:5001/community/files`);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      console.log("📥 响应状态:", response.status, response.statusText);
      console.log("🔗 响应URL:", response.url);
      
      // 检查响应头
      response.headers.forEach((value, key) => {
        console.log(`📋 ${key}: ${value}`);
      });
      
      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          console.error('❌ 响应错误文本:', errorText);
          
          // 尝试解析错误信息
          try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.message || `HTTP错误: ${response.status}`);
          } catch {
            throw new Error(`HTTP错误: ${response.status} - ${errorText}`);
          }
        } catch (e) {
          console.error('❌ 读取响应错误:', e);
          throw new Error(`HTTP错误: ${response.status}`);
        }
      }

      const result = await response.json();
      console.log("✅ API响应:", result);
      
      if (result.success) {
        console.log(`📄 获取到 ${result.files?.length || 0} 个文件`);
        setFiles(result.files || []);
        setFilteredFiles(result.files || []);
        
        if (keyword) {
          toast({
            title: "搜索完成",
            description: `找到 ${result.files?.length || 0} 个相关文件`,
            duration: 2000,
          });
        }
      } else {
        throw new Error(result.message || "获取文件列表失败");
      }
    } catch (error) {
      console.error('❌ 获取社区文件错误:', error);
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      toast({
        title: "加载失败",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // 获取社区统计
  const fetchCommunityStats = async () => {
    try {
      setStatsLoading(true);
      console.log("📊 开始获取社区统计...");
      
      console.log("🌐 前端请求URL:", '/api/community/stats');
      console.log("📡 预期代理到后端:", 'http://localhost:5001/community/stats');
      
      const response = await fetch('/api/community/stats', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      console.log("📥 统计响应状态:", response.status, response.statusText);
      
      if (!response.ok) {
        console.error('❌ 统计API错误:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ 错误响应:', errorText);
        return; // 不抛出错误，统计信息失败不影响页面
      }

      const result = await response.json();
      console.log("📊 统计响应:", result);
      
      if (result.success) {
        setStats(result.stats);
        console.log("✅ 社区统计获取成功");
      } else {
        console.error('❌ 统计API返回失败:', result.message);
      }
    } catch (error) {
      console.error('❌ 获取社区统计错误:', error);
      console.error('错误详情:', error);
      // 不阻止页面显示，统计信息失败不影响主功能
    } finally {
      setStatsLoading(false);
    }
  };

  // 初始化加载
  useEffect(() => {
    console.log("🚀 Community组件初始化");
    
    const loadData = async () => {
      await Promise.all([
        fetchCommunityFiles(),
        fetchCommunityStats()
      ]);
    };
    
    loadData();
  }, []);

  // 搜索处理
  const handleSearch = () => {
    if (searchTerm.trim()) {
      console.log("🔍 执行搜索:", searchTerm);
      fetchCommunityFiles(searchTerm.trim());
    } else {
      // 清空搜索，显示所有文件
      setFilteredFiles(files);
    }
  };

  // 清空搜索
  const handleClearSearch = () => {
    setSearchTerm('');
    setFilteredFiles(files);
    toast({
      title: "搜索已清空",
      description: "显示所有文件",
      duration: 1500,
    });
  };

  // 刷新数据
  const handleRefresh = () => {
    console.log("🔄 刷新社区数据");
    setLoading(true);
    Promise.all([
      fetchCommunityFiles(),
      fetchCommunityStats()
    ]);
  };

  // 格式化时间
  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return timeStr;
    }
  };

  // 截断文本
  const truncateText = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // 显示加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* 简化版，移除Navigation组件 */}
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl h-16 flex items-center px-4">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow-primary" />
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                TalkToEarn
              </span>
            </div>
            <Link to="/">
              <Button variant="ghost">返回首页</Button>
            </Link>
          </div>
        </nav>
        
        <main className="container mx-auto px-4 pt-24 pb-16">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  内容分享社区
                </h1>
                <p className="text-muted-foreground text-lg">
                  探索平台上的优质内容
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="p-6">
                    <Skeleton className="h-6 w-3/4 mb-4" />
                    <Skeleton className="h-4 w-1/2 mb-4" />
                    <Skeleton className="h-20 w-full mb-4" />
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 简化版导航 */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl h-16 flex items-center px-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow-primary" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              TalkToEarn
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost">首页</Button>
            </Link>
            <Link to="/upload">
              <Button variant="ghost">上传</Button>
            </Link>
            <Link to="/chat">
              <Button variant="ghost">AI对话</Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost">仪表盘</Button>
            </Link>
            <Button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2"
              size="sm"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              刷新
            </Button>
          </div>
        </div>
      </nav>
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          {/* 头部区域 */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                内容分享社区
              </h1>
              <p className="text-muted-foreground text-lg">
                探索平台上的优质内容，分享你的知识
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                onClick={() => window.location.href = '/upload'}
                className="bg-gradient-to-r from-primary to-secondary text-white"
              >
                <FileText className="mr-2 h-4 w-4" />
                分享内容
              </Button>
            </div>
          </div>

          {/* 统计卡片 */}
          {!statsLoading && stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">总文件数</p>
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <p className="text-2xl font-bold">{stats.total_files}</p>
                <p className="text-xs text-muted-foreground mt-2">平台共享内容</p>
              </Card>
              
              <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">总引用次数</p>
                  <TrendingUp className="h-5 w-5 text-secondary" />
                </div>
                <p className="text-2xl font-bold">{stats.total_references}</p>
                <p className="text-xs text-muted-foreground mt-2">内容被AI引用</p>
              </Card>
              
              <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">总收益</p>
                  <Coins className="h-5 w-5 text-accent" />
                </div>
                <p className="text-2xl font-bold">{stats.total_rewards.toFixed(6)} USDT</p>
                <p className="text-xs text-muted-foreground mt-2">内容创造价值</p>
              </Card>
              
              <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">活跃作者</p>
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <p className="text-2xl font-bold">{stats.active_authors}</p>
                <p className="text-xs text-muted-foreground mt-2">参与贡献用户</p>
              </Card>
            </div>
          )}

          {/* 搜索区域 */}
          <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm mb-8">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="搜索文件ID、文件名、内容关键词或作者..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleSearch}
                  disabled={loading}
                  className="flex-1 sm:flex-none"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      搜索中...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      搜索
                    </>
                  )}
                </Button>
                
                {searchTerm && (
                  <Button 
                    onClick={handleClearSearch}
                    variant="outline"
                  >
                    清空
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* 文件列表 */}
          {!loading && (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">
                  所有内容
                  <span className="text-sm text-muted-foreground ml-2">
                    ({filteredFiles.length} 个文件)
                  </span>
                </h2>
                
                {filteredFiles.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      按上传时间排序
                    </span>
                  </div>
                )}
              </div>

              {filteredFiles.length === 0 ? (
                <Card className="p-12 text-center border-border/50 bg-gradient-card backdrop-blur-sm">
                  <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">
                    {searchTerm ? '没有找到相关内容' : '暂无分享内容'}
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    {searchTerm 
                      ? '尝试使用其他关键词搜索'
                      : '成为第一个分享内容的人吧！'
                    }
                  </p>
                  {searchTerm ? (
                    <Button onClick={handleClearSearch}>
                      显示所有文件
                    </Button>
                  ) : (
                    <Button onClick={() => window.location.href = '/upload'}>
                      立即分享
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredFiles.map((file) => (
                    <Link to={`/file_detail/${file.file_id}`} key={file.file_id}>
                      <Card className="h-full p-6 border-border/50 bg-gradient-card backdrop-blur-sm hover:shadow-lg transition-all duration-300 hover:border-primary/30 cursor-pointer group">
                        {/* 文件头部 */}
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                              {file.filename}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground truncate">
                                {file.user_id.slice(0, 10)}...{file.user_id.slice(-6)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end">
                            <div className="text-xs bg-muted px-2 py-1 rounded mb-2 font-mono">
                              <Hash className="inline h-3 w-3 mr-1" />
                              {file.file_id.slice(-8)}
                            </div>
                            
                            {file.authorize_rag && (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                AI学习
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* 文件内容预览 */}
                        <div className="mb-4">
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {truncateText(file.content, 120)}
                          </p>
                        </div>

                        {/* 文件统计信息 */}
                        <div className="flex justify-between items-center border-t pt-4">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {formatTime(file.upload_time)}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3 text-muted-foreground" />
                              <span className={`text-xs ${file.reference_count > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                                引用 {file.reference_count}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Coins className="h-3 w-3 text-yellow-600" />
                            <span className="text-xs font-medium">
                              {file.total_reward.toFixed(6)} USDT
                            </span>
                          </div>
                        </div>

                        {/* 查看详情提示 */}
                        <div className="mt-4 pt-3 border-t border-dashed flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">
                            点击查看完整内容
                          </span>
                          <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}

              {/* 分页提示（如果需要） */}
              {filteredFiles.length > 9 && (
                <div className="mt-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    显示 {Math.min(9, filteredFiles.length)} 个文件，共 {filteredFiles.length} 个
                  </p>
                  <Button variant="outline" className="mt-4" onClick={() => {
                    toast({
                      title: "功能提示",
                      description: "分页功能正在开发中",
                      duration: 2000,
                    });
                  }}>
                    加载更多
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Community;