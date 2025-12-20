import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Wallet, Upload, MessageSquare, LayoutDashboard, CheckCircle, Copy, Users, ArrowUpRight } from "lucide-react";
import { useWeb3 } from "@/hooks/useWeb3";
import { switchToChain, CHAIN_CONFIGS } from "@/lib/chains";
import { getZetaBalance } from "@/lib/zetachain";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

export const Navigation = () => {
  const location = useLocation();
  const { provider, isConnected, account, connect, disconnect } = useWeb3();
  const [copied, setCopied] = useState(false);
  const [zetaBalance, setZetaBalance] = useState<string>('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [currentNetwork, setCurrentNetwork] = useState<string | null>(null);
  
  // 获取当前网络
  useEffect(() => {
    if (!provider || !isConnected) {
      setCurrentNetwork(null);
      return;
    }

    const updateCurrentNetwork = async () => {
      try {
        const network = await provider.getNetwork();
        const chainId = network.chainId.toString();
        const chain = Object.keys(CHAIN_CONFIGS).find((key) => {
          const config = CHAIN_CONFIGS[key as any];
          const configChainId = config.chainId.replace('0x', '');
          const currentChainIdHex = BigInt(chainId).toString(16);
          return config.chainId === `0x${currentChainIdHex}` || 
                 config.chainId === chainId ||
                 (configChainId && BigInt(`0x${configChainId}`) === BigInt(chainId));
        });

        if (chain) {
          setCurrentNetwork(CHAIN_CONFIGS[chain as any].chainName);
        } else {
          setCurrentNetwork('未知网络');
        }
      } catch (error) {
        console.error('获取当前网络失败:', error);
        setCurrentNetwork(null);
      }
    };

    updateCurrentNetwork();
  }, [provider, isConnected]);

  // 调试日志
  console.log('📊 Navigation组件状态:')
  console.log('   - isConnected:', isConnected)
  console.log('   - account:', account)
  console.log('   - currentNetwork:', currentNetwork)
  
  // 连接钱包并强制切换到 ZetaChain
  const handleConnect = async () => {
    try {
      await connect();
      // 强制切换到 ZetaChain Testnet
      await switchToChain('zetachain');
      // 等待网络切换完成
      await new Promise(resolve => setTimeout(resolve, 1500));
      // 直接调用余额查询，避免刷新页面
      await fetchZetaBalance();
    } catch (error: any) {
      console.error('连接钱包失败:', error);
      console.error('错误详情:', { code: error.code, message: error.message, stack: error.stack });
      alert(`连接钱包失败: ${error.message || '未知错误'}`);
    }
  };

  // 复制地址到剪贴板
  const handleCopyAddress = async () => {
    if (account) {
      try {
        await navigator.clipboard.writeText(account);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('复制失败:', error);
      }
    }
  };

  // 获取ZETA余额
  const fetchZetaBalance = async () => {
    console.log('📞 调用fetchZetaBalance函数:')
    console.log('   - isConnected:', isConnected)
    console.log('   - provider:', provider ? '已获取' : '未获取')
    console.log('   - account:', account)
    
    if (isConnected && provider && account) {
      try {
        setIsLoadingBalance(true);
        console.log('🔄 获取signer...')
        const signer = await provider.getSigner();
        console.log('✅ signer获取成功:', signer ? '是' : '否')
        
        console.log('🔄 调用getZetaBalance...')
        const balance = await getZetaBalance(provider, signer);
        console.log('✅ getZetaBalance返回:', balance)
        
        setZetaBalance(balance);
      } catch (error) {
        console.error('❌ 获取ZETA余额失败:', error);
        console.error('错误详情:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        })
      } finally {
        setIsLoadingBalance(false);
      }
    } else {
      console.log('⚠️  跳过余额查询，条件不满足')
    }
  };

  // 当用户连接或当前网络变化时获取余额
  useEffect(() => {
    fetchZetaBalance();
  }, [isConnected, currentNetwork, account]);
  
  const navItems = [
    { path: "/", label: "首页", icon: LayoutDashboard },
    { path: "/upload", label: "上传内容", icon: Upload },
    { path: "/community", label: "内容分享", icon: Users },
    { path: "/chat", label: "AI 对话", icon: MessageSquare },
    { path: "/staking", label: "质押管理", icon: ArrowUpRight },
    { path: "/dashboard", label: "个人仪表盘", icon: LayoutDashboard },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow-primary" />
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              AI DataMarket
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={isActive ? "shadow-glow-primary" : ""}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </div>

          {isConnected && account ? (
            <div className="flex items-center gap-2">
              {/* 当前网络显示 */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-sm font-medium text-blue-900">
                  {currentNetwork || '未知网络'}
                </span>
              </div>
              
              {/* ZETA余额显示 */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg">
                <span className="text-sm font-medium text-purple-900">
                  {isLoadingBalance ? '加载中...' : `${(parseFloat(zetaBalance) || 0).toFixed(3)} ZETA`}
                </span>
              </div>
              
              {/* 钱包地址显示和登出下拉菜单 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100 transition-colors">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900"></span>
                    <Wallet className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-mono text-gray-700">
                      {account.slice(0, 6)}...{account.slice(-4)}
                    </span>
                    <button
                      onClick={handleCopyAddress}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title="复制地址"
                    >
                      {copied ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={disconnect} className="text-red-600">
                    断开并登出
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button onClick={handleConnect} className="shadow-glow-primary">
              <Wallet className="mr-2 h-4 w-4" />
              连接钱包
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
};
