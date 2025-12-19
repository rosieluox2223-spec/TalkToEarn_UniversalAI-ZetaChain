import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Database, Brain, Shield, Sparkles, Wallet, CheckCircle, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { useWeb3 } from "@/hooks/useWeb3";
import { switchToChain, CHAIN_CONFIGS } from "@/lib/chains";
import { useState, useEffect } from "react";

const Index = () => {
  const { provider, isConnected, account, connect } = useWeb3();
  const [currentChain, setCurrentChain] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 连接钱包并强制切换到 ZetaChain
  const handleConnect = async () => {
    try {
      await connect();
      // 强制切换到 ZetaChain Testnet
      await switchToChain('zetachain');
      // 等待网络切换完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 刷新页面以更新 provider
      window.location.reload();
    } catch (error: any) {
      console.error('连接钱包失败:', error);
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

  // 获取当前网络
  useEffect(() => {
    if (!provider || !isConnected) {
      setCurrentChain(null);
      return;
    }

    const updateCurrentChain = async () => {
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
          setCurrentChain(CHAIN_CONFIGS[chain as any].chainName);
        } else {
          setCurrentChain('未知网络');
        }
      } catch (error) {
        console.error('获取当前网络失败:', error);
        setCurrentChain(null);
      }
    };

    updateCurrentChain();
  }, [provider, isConnected]);

  useEffect(() => {
  console.log("🔥 wallet effect fired", { isConnected, account });
  if (!isConnected || !account) return;

  const connectBackendWallet = async () => {
    try {
      const res = await fetch("http://localhost:5001/connect_wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wallet_address: account,
        }),
      });

      const data = await res.json();
      console.log("connect_wallet 返回：", data);

      if (!data.success) {
        console.error("后端连接失败：", data.message);
      }
    } catch (err) {
      console.error("调用 connect_wallet 失败：", err);
    }
  };

  connectBackendWallet();
}, [isConnected, account]);


  const features = [
    {
      icon: Database,
      title: "数据资产化",
      description: "将您的内容铸造为 Data NFT，确保数据所有权和价值",
    },
    {
      icon: Brain,
      title: "AI 模型授权",
      description: "灵活设置 AI 模型访问权限，实现数据商业化",
    },
    {
      icon: Shield,
      title: "内容溯源",
      description: "区块链技术确保每次 AI 调用都可追溯和验证",
    },
    {
      icon: Sparkles,
      title: "收益分配",
      description: "自动化的智能合约收益分配机制",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main>
        <section className="container mx-auto px-4 pt-32 pb-20">
          <div className="max-w-4xl mx-auto text-center">
            <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm text-primary">Web3 × AI 数据市场</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent leading-tight">
              让您的数据
              <br />
              为 AI 赋能
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              通过区块链技术将内容转化为 Data NFT，授权 AI 模型使用并获得收益。
              每次 AI 推理都可追溯，确保创作者权益。
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/upload">
                <Button size="lg" className="shadow-glow-primary">
                  开始上传
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/chat">
                <Button size="lg" variant="outline" className="border-border/50">
                  体验 AI 对话
                </Button>
              </Link>
            </div>

            {/* 钱包连接状态 */}
            <div className="mt-8 flex justify-center items-center gap-2">
              {isConnected && account ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-900">已连接</span>
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
                  {currentChain && (
                    <span className="text-xs text-gray-500">
                      网络: {currentChain}
                    </span>
                  )}
                </div>
              ) : (
                <Button
                  onClick={handleConnect}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  连接 MetaMask
                </Button>
              )}
            </div>
          </div>

          <div className="mt-20 relative">
            <div className="absolute inset-0 bg-gradient-primary opacity-20 blur-3xl" />
            <Card className="relative p-8 border-border/50 bg-gradient-card backdrop-blur-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div key={feature.title} className="text-center">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </section>

        <section className="container mx-auto px-4 py-20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">
              工作流程
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                <div className="text-4xl font-bold text-primary mb-4">01</div>
                <h3 className="text-xl font-semibold mb-2">上传内容</h3>
                <p className="text-muted-foreground">
                  上传您的文本、文档等内容到 IPFS，系统自动向量化处理
                </p>
              </Card>

              <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                <div className="text-4xl font-bold text-secondary mb-4">02</div>
                <h3 className="text-xl font-semibold mb-2">铸造 NFT</h3>
                <p className="text-muted-foreground">
                  智能合约将数据打包为 Data NFT，设置 AI 模型访问权限
                </p>
              </Card>

              <Card className="p-6 border-border/50 bg-gradient-card backdrop-blur-sm">
                <div className="text-4xl font-bold text-accent mb-4">03</div>
                <h3 className="text-xl font-semibold mb-2">获得收益</h3>
                <p className="text-muted-foreground">
                  AI 模型使用您的数据时，自动获得收益并记录链上
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-20">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-6">
              立即开始您的数据资产化之旅
            </h2>
            <p className="text-muted-foreground mb-8">
              连接钱包，上传内容，让 AI 为您的创作付费
            </p>
            <Link to="/upload">
              <Button size="lg" className="shadow-glow-primary">
                立即开始
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2024 AI DataMarket. Powered by Web3 & AI Technology.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
