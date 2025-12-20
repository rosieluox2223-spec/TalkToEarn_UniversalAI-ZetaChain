// src/pages/FileDetail.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { 
  ArrowLeft, 
  FileText, 
  User, 
  Calendar, 
  Coins, 
  TrendingUp, 
  ExternalLink,
  Copy,
  Check,
  Globe,
  Shield,
  AlertCircle,
  Loader2
} from "lucide-react";

interface FileDetailInfo {
  file_id: string;
  filename: string;
  user_id: string;
  content: string;
  content_preview: string;
  upload_time: string;
  reference_count: number;
  total_reward: number;
  authorize_rag: boolean;
  ipfs_url: string;
  file_path: string;
}

const FileDetail = () => {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [fileInfo, setFileInfo] = useState<FileDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [userAddress, setUserAddress] = useState('');

  // 从localStorage获取用户钱包地址
  useEffect(() => {
    const walletAddress = localStorage.getItem('wallet_address') || '';
    setUserAddress(walletAddress);
  }, []);

  // 获取文件详情
  useEffect(() => {
    const fetchFileDetail = async () => {
      if (!fileId) {
        setError('文件ID无效');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        console.log("🔍 获取文件详情，ID:", fileId);
        const response = await fetch(`/api/community/file/${fileId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          setFileInfo(result.file_info);
          console.log("✅ 文件详情获取成功");
        } else {
          throw new Error(result.message || '获取文件详情失败');
        }
      } catch (error) {
        console.error('❌ 获取文件详情错误:', error);
        setError(error instanceof Error ? error.message : '未知错误');
      } finally {
        setLoading(false);
      }
    };

    fetchFileDetail();
  }, [fileId]);

  // 复制内容到剪贴板
  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({
        title: "复制成功",
        description: `${type}已复制到剪贴板`,
        duration: 2000,
      });
      
      setTimeout(() => setCopied(false), 2000);
    });
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
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return timeStr;
    }
  };

  // 显示加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl h-16 flex items-center px-4">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow-primary" />
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                TalkToEarn
              </span>
            </div>
            <Link to="/community">
              <Button variant="ghost">返回社区</Button>
            </Link>
          </div>
        </nav>
        
        <main className="container mx-auto px-4 pt-24 pb-16">
          <div className="max-w-4xl mx-auto">
            <Button variant="ghost" className="mb-6" onClick={() => navigate('/community')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回内容分享
            </Button>
            
            <Card className="p-8">
              <Skeleton className="h-8 w-3/4 mb-4" />
              <div className="space-y-4 mb-8">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
              </div>
              
              <div className="space-y-2 mb-8">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-40 w-full" />
              </div>
              
              <div className="flex gap-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
              </div>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // 显示错误状态
  if (error || !fileInfo) {
    return (
      <div className="min-h-screen bg-background">
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl h-16 flex items-center px-4">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow-primary" />
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
               TalkToEarn 
              </span>
            </div>
            <Link to="/community">
              <Button variant="ghost">返回社区</Button>
            </Link>
          </div>
        </nav>
        
        <main className="container mx-auto px-4 pt-24 pb-16">
          <div className="max-w-4xl mx-auto">
            <Button variant="ghost" className="mb-6" onClick={() => navigate('/community')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回内容分享
            </Button>
            
            <Card className="p-8">
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
                <h2 className="text-2xl font-semibold mb-2">加载失败</h2>
                <p className="text-muted-foreground mb-6 text-center">
                  {error || '文件不存在或已被删除'}
                </p>
                <div className="flex gap-4">
                  <Button onClick={() => navigate('/community')}>
                    返回社区
                  </Button>
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    重试
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // 检查是否是文件所有者
  const isOwner = userAddress === fileInfo.user_id;

  return (
    <div className="min-h-screen bg-background">
      {/* 简化导航 */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl h-16 flex items-center px-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow-primary" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              TalkToEarn
            </span>
          </div>
          <Link to="/community">
            <Button variant="ghost">返回社区</Button>
          </Link>
        </div>
      </nav>
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          {/* 返回按钮 */}
          <Button 
            variant="ghost" 
            className="mb-6" 
            onClick={() => navigate('/community')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回内容分享
          </Button>

          {/* 文件详情卡片 */}
          <Card className="border-border/50 bg-gradient-card backdrop-blur-sm overflow-hidden">
            {/* 头部信息 */}
            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 p-6 border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h1 className="text-2xl font-bold truncate">{fileInfo.filename}</h1>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span className="font-mono">
                        {fileInfo.user_id.slice(0, 10)}...{fileInfo.user_id.slice(-6)}
                      </span>
                      {isOwner && (
                        <Badge variant="secondary" className="ml-2">
                          我的文件
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>{formatTime(fileInfo.upload_time)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {fileInfo.authorize_rag && (
                    <Badge className="bg-green-100 text-green-800 border-green-200">
                      <Shield className="mr-1 h-3 w-3" />
                      已授权AI学习
                    </Badge>
                  )}
                  
                  <Badge variant="outline" className="font-mono">
                    ID: {fileInfo.file_id.slice(-12)}
                  </Badge>
                </div>
              </div>
              
              {/* 统计信息 */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">被引用次数</p>
                    <p className="text-lg font-bold">{fileInfo.reference_count}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100">
                    <Coins className="h-4 w-4 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">总收益</p>
                    <p className="text-lg font-bold">{fileInfo.total_reward.toFixed(6)} USDT</p>
                  </div>
                </div>
                
                {fileInfo.ipfs_url && fileInfo.ipfs_url !== "None" && (
                  <a
                    href={fileInfo.ipfs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100">
                      <Globe className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">IPFS存储</p>
                      <p className="text-sm font-medium text-purple-600">查看</p>
                    </div>
                  </a>
                )}
              </div>
            </div>
            
            {/* 文件内容 */}
            <div className="p-6">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-semibold">内容详情</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(fileInfo.content, '内容')}
                    className="h-8"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 mr-1 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    复制内容
                  </Button>
                </div>
                
                <div className="bg-muted/30 rounded-lg p-6">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {fileInfo.content}
                  </pre>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              {/* 文件元数据 */}
              <div className="grid grid-cols-1 gap-4 text-sm">
                <div>
                  <h3 className="font-medium mb-2">文件信息</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">文件ID:</span>
                      <span className="font-mono text-xs">{fileInfo.file_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">AI授权:</span>
                      <span className={fileInfo.authorize_rag ? "text-green-600" : "text-red-600"}>
                        {fileInfo.authorize_rag ? "已授权" : "未授权"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 操作按钮 */}
            <div className="border-t p-6 bg-muted/20">
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={() => navigate('/community')}
                  variant="outline"
                  className="flex-1"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回列表
                </Button>
                
                {fileInfo.ipfs_url && fileInfo.ipfs_url !== "None" && (
                  <a
                    href={fileInfo.ipfs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button className="w-full">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      查看IPFS
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </Card>
          
          {/* 相关提示 */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                如何提高收益？
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 授权AI学习可获得更多引用</li>
                <li>• 高质量内容更容易被AI采纳</li>
                <li>• 定期更新内容保持时效性</li>
              </ul>
            </Card>
            
            <Card className="p-4">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                AI学习授权
              </h3>
              <p className="text-sm text-muted-foreground">
                {fileInfo.authorize_rag 
                  ? '此文件已授权AI学习，模型可以引用内容生成回答'
                  : '此文件未授权AI学习，模型不会引用此内容'
                }
              </p>
            </Card>
            
            <Card className="p-4">
              <h3 className="font-medium mb-2 flex items-center gap-2">
                <Coins className="h-4 w-4" />
                收益规则
              </h3>
              <p className="text-sm text-muted-foreground">
                每次被AI引用可获得收益，收益自动结算到账户
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FileDetail;