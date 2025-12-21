import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Coins, FileText, Zap, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useWeb3 } from "@/hooks/useWeb3";

interface DashboardData {
  stats: {
    total_earned: { label: string; value: string; raw_value: number };
    data_nft: { label: string; value: string; raw_value: number };
    ai_calls: { label: string; value: string; raw_value: number };
    monthly_growth: { label: string; value: string; raw_value: number };
  };
  recent_activity: Array<{
    id: number;
    type: string;
    content: string;
    time: string;
    timestamp: string;
  }>;
  content_tracing: Array<{
    file_id: string;
    filename: string;
    reference_count: number;
    total_reward: number;
    content_preview: string;
    ipfs_url: string;
    authorize_rag: boolean;
  }>;
  user_info: {
    user_id: string;
    wallet_address: string;
    coin_balance: number;
    total_earned: number;
    total_spent: number;
  };
}

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { account, isConnected } = useWeb3();

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      console.log("🔍 开始获取仪表盘数据...");
      console.log("💰 钱包地址:", account);
      console.log("🔗 钱包连接状态:", isConnected);
      
      if (!isConnected || !account) {
        const errorMsg = "请先连接钱包以查看仪表盘";
        console.log("❌", errorMsg);
        setError(errorMsg);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 构建请求URL
      const apiUrl = `/api/dashboard?wallet_address=${account}`;
      console.log("🌐 请求URL:", apiUrl);
      
      const startTime = Date.now();
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      const endTime = Date.now();
      console.log("⏱️ 请求耗时:", endTime - startTime, "ms");
      console.log("📥 响应状态:", response.status, response.statusText);

      if (!response.ok) {
        let errorText = "";
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
      console.log("✅ API响应成功:", result);
      
      if (result.success) {
        console.log("📊 数据获取成功，用户信息:", result.data?.user_info);
        setData(result.data);
        toast({
          title: "数据加载成功",
          description: "仪表盘数据已更新",
          duration: 2000,
        });
      } else {
        console.log("❌ API返回失败:", result.message);
        throw new Error(result.message || "获取数据失败");
      }
    } catch (error) {
      console.error('❌ 获取仪表盘数据错误详情:', error);
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      setError(errorMsg);
      toast({
        title: "数据加载失败",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    console.log("🚀 Dashboard组件初始化");
    console.log("📱 钱包状态 - 已连接:", isConnected, "地址:", account);
    
    if (isConnected && account) {
      console.log("🔄 开始获取数据...");
      fetchDashboardData();
    } else {
      console.log("⏸️ 钱包未连接，跳过数据获取");
      setLoading(false);
      if (!isConnected) {
        setError("请先连接钱包");
      }
    }
  }, [isConnected, account]);

  const handleRefresh = () => {
    console.log("🔄 手动刷新数据");
    if (isConnected && account) {
      fetchDashboardData();
    } else {
      toast({
        title: "未连接钱包",
        description: "请先连接钱包",
        variant: "destructive",
      });
    }
  };

  // 如果未连接钱包，显示连接钱包提示
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-16">
          <div className="max-w-6xl mx-auto text-center py-16">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              个人仪表盘
            </h1>
            <p className="text-muted-foreground text-lg mb-8">
              请先连接钱包以查看您的收益、Data NFT 和 AI 使用记录
            </p>
            <div className="bg-gradient-card backdrop-blur-sm border border-border/50 rounded-xl p-8 max-w-md mx-auto">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Coins className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">钱包未连接</h2>
              <p className="text-muted-foreground mb-6">
                请点击页面右上角的"连接钱包"按钮，连接您的钱包以访问仪表盘
              </p>
              <Button 
                onClick={() => window.location.reload()} 
                className="w-full"
              >
                刷新页面
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 显示错误信息
  if (error && !loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 pt-24 pb-16">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  个人仪表盘
                </h1>
                <p className="text-muted-foreground text-lg">
                  查看您的收益、Data NFT 和 AI 使用记录
                </p>
                {account && (
                  <p className="text-sm text-muted-foreground mt-1">
                    当前钱包: {account.slice(0, 8)}...{account.slice(-6)}
                  </p>
                )}
              </div>
              
              <Button
                onClick={handleRefresh}
                disabled={refreshing || !isConnected}
                className="flex items-center gap-2"
                size="sm"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {refreshing ? '刷新中...' : '刷新数据'}
              </Button>
            </div>
            
            <Card className="p-8 border-border/50 bg-gradient-card backdrop-blur-sm">
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
                <h2 className="text-2xl font-semibold mb-2">数据加载失败</h2>
                <p className="text-muted-foreground mb-6 text-center">{error}</p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button onClick={handleRefresh} variant="default" className="mb-2 sm:mb-0">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    重试
                  </Button>
                  <Button 
                    onClick={() => {
                      console.log("🔄 手动检查连接");
                      console.log("🌐 当前URL:", window.location.href);
                      console.log("🔗 钱包地址:", account);
                      console.log("📡 准备请求的URL:", `/api/dashboard?wallet_address=${account}`);
                      toast({
                        title: "调试信息已记录",
                        description: "请查看浏览器控制台",
                        duration: 3000,
                      });
                    }} 
                    variant="outline"
                  >
                    调试信息
                  </Button>
                  <Button onClick={() => window.location.href = '/upload'} variant="outline">
                    去上传内容
                  </Button>
                </div>
                <div className="mt-6 text-sm text-muted-foreground text-center max-w-md">
                  <p>💡 调试步骤:</p>
                  <p>1. 按F12打开开发者工具</p>
                  <p>2. 查看Console标签中的日志</p>
                  <p>3. 查看Network标签中的请求详情</p>
                  <p>4. 点击"调试信息"按钮查看更多信息</p>
                </div>
              </div>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // 显示数据
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                个人仪表盘
              </h1>
              <p className="text-muted-foreground text-lg">
                查看您的收益、Data NFT 和 AI 使用记录
              </p>
              {data?.user_info.wallet_address && (
                <p className="text-sm text-muted-foreground mt-1">
                  钱包地址: {data.user_info.wallet_address.slice(0, 8)}...{data.user_info.wallet_address.slice(-6)}
                </p>
              )}
              {account && !data && !loading && (
                <p className="text-sm text-muted-foreground mt-1">
                  当前钱包: {account.slice(0, 8)}...{account.slice(-6)}
                </p>
              )}
            </div>
            
            <Button
              onClick={handleRefresh}
              disabled={refreshing || !isConnected}
              className="flex items-center gap-2"
              size="sm"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {refreshing ? '刷新中...' : '刷新数据'}
            </Button>
          </div>

          {/* 加载状态 */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <span className="text-lg mb-2">正在加载仪表盘数据...</span>
              <p className="text-sm text-muted-foreground">
                正在从后端获取用户统计信息
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                钱包地址: {account?.slice(0, 8)}...{account?.slice(-6)}
              </p>
            </div>
          )}

          {/* 数据展示 */}
          {!loading && data && (
            <>
              {/* 统计数据卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  { 
                    label: "总收益", 
                    value: data.stats.total_earned.value, 
                    icon: Coins, 
                    color: "text-primary",
                    rawValue: data.stats.total_earned.raw_value
                  },
                  { 
                    label: "Data NFT", 
                    value: data.stats.data_nft.value, 
                    icon: FileText, 
                    color: "text-secondary",
                    rawValue: data.stats.data_nft.raw_value
                  },
                  { 
                    label: "AI 调用次数", 
                    value: data.stats.ai_calls.value, 
                    icon: Zap, 
                    color: "text-accent",
                    rawValue: data.stats.ai_calls.raw_value
                  },
                  { 
                    label: "本月增长", 
                    value: data.stats.monthly_growth.value, 
                    icon: TrendingUp, 
                    color: "text-primary",
                    rawValue: data.stats.monthly_growth.raw_value
                  },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <Card
                      key={stat.label}
                      className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                        <Icon className={`h-5 w-5 ${stat.color}`} />
                      </div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      
                      {stat.label === "总收益" && data && (
                        <p className="text-xs text-muted-foreground mt-2">
                          余额: {data.user_info.coin_balance.toFixed(6)} ZETA
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* 最近活动和内容溯源 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 最近活动卡片 */}
                <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">最近活动</h2>
                    <span className="text-sm text-muted-foreground">
                      {data.recent_activity.length} 条记录
                    </span>
                  </div>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {data.recent_activity.length > 0 ? (
                      data.recent_activity.map((activity) => (
                        <div
                          key={`${activity.id}-${activity.timestamp || ''}`}
                          className="flex items-start gap-3 p-3 rounded-lg bg-background/30 border border-border/30 hover:bg-background/50 transition-colors"
                        >
                          <div className={`h-2 w-2 rounded-full mt-2 ${
                            activity.type === "收益" ? "bg-green-500" :
                            activity.type === "支出" ? "bg-red-500" :
                            activity.type === "引用" ? "bg-blue-500" : "bg-primary"
                          }`} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{activity.content}</p>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {activity.type}
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {activity.time}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        暂无活动记录
                      </div>
                    )}
                  </div>
                </Card>

                {/* 内容溯源卡片 */}
                <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">内容溯源</h2>
                    <span className="text-sm text-muted-foreground">
                      {data.content_tracing.length} 个文件
                    </span>
                  </div>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {data.content_tracing.length > 0 ? (
                      data.content_tracing.map((item) => (
                        <div
                          key={item.file_id}
                          className="p-4 rounded-lg bg-background/30 border border-border/30 hover:bg-background/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium truncate mr-2">
                              {item.filename}
                            </span>
                            <span className={`text-xs ${
                              item.reference_count > 0 ? "text-primary" : "text-secondary"
                            }`}>
                              被引用 {item.reference_count} 次
                            </span>
                          </div>
                          
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                            {item.content_preview}
                          </p>
                          
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="bg-muted px-2 py-0.5 rounded">
                              收益: {item.total_reward.toFixed(6)} ZETA
                            </span>
                            
                            {item.ipfs_url && item.ipfs_url !== "None" && item.ipfs_url !== "null" && (
                              <a
                                href={item.ipfs_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-muted px-2 py-0.5 rounded hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                IPFS查看
                              </a>
                            )}
                            
                            {item.authorize_rag && (
                              <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                已授权AI
                              </span>
                            )}
                          </div>
                          
                          <p className="text-xs text-muted-foreground mt-2 truncate">
                            ID: {item.file_id}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        暂无上传文件
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* 额外信息 */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4">
                  <h3 className="font-medium mb-2">账户概览</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">用户ID:</span>
                      <span className="font-mono">{data.user_info.user_id.slice(0, 10)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">总支出:</span>
                      <span>{data.user_info.total_spent.toFixed(6)} ZETA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">净收益:</span>
                      <span className="text-green-500">
                        {(data.user_info.total_earned - data.user_info.total_spent).toFixed(6)} ZETA
                      </span>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-4">
                  <h3 className="font-medium mb-2">今日统计</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">今日收益:</span>
                      <span className="text-green-500">
                        {data.stats.monthly_growth.raw_value > 0 ? '+' : ''}
                        {data.stats.monthly_growth.raw_value.toFixed(6)} ZETA
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">今日引用:</span>
                      <span>{data.stats.ai_calls.raw_value} 次</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">上传文件:</span>
                      <span>{data.stats.data_nft.raw_value} 个</span>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-4">
                  <h3 className="font-medium mb-2">快速操作</h3>
                  <div className="space-y-2">
                    <Button 
                      className="w-full text-sm px-3 py-2"
                      onClick={() => window.location.href = '/upload'}
                    >
                      上传新内容
                    </Button>
                    <Button 
                      variant="secondary"
                      className="w-full text-sm px-3 py-2"
                      onClick={() => window.location.href = '/community'}
                    >
                      查看所有文件
                    </Button>
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
