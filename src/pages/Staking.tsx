import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowUpRight, ArrowDownLeft, Wallet, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useWeb3 } from '../hooks/useWeb3';
import { ethers } from 'ethers';


// 导入智能合约ABI
import TalkToEarnManagerABI from '../../TalkToEarnManager.abi.json';
import ZetaABI from '../../zeta.abi.json';

// 配置合约地址
const CONTRACT_CONFIG = {
  // TalkToEarnManager 合约地址
  MANAGER_ADDR: "0xD7BF0f6Ec8Cb9b8f334cfe012D1021d54Dc273b4",
  // WZETA 地址 (替代 ZRC20-BNB)
  WZETA_ADDR: "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf"
};

// WZETA 接口定义
// 使用导入的ZetaABI替代硬编码ABI
const IWZETAABI = ZetaABI;

const Staking = () => {
  const { provider, isConnected, account, connect } = useWeb3();
  const [currentNetwork, setCurrentNetwork] = useState<string | null>(null);
  
  // 状态管理
  const [stakeAmount, setStakeAmount] = useState("0.0001");
  const [unstakeAmount, setUnstakeAmount] = useState("0.0001");
  const [isStaking, setIsStaking] = useState(false);
  const [isUnstaking, setIsUnstaking] = useState(false);
  const [userBalance, setUserBalance] = useState("0");
  const [stakedBalance, setStakedBalance] = useState("0");
  const [pendingRewards, setPendingRewards] = useState("0");
  const [isLoading, setIsLoading] = useState(false);
  const [chainId, setChainId] = useState<string>("未知");
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  
  // 文件选择相关状态
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  
  // 质押记录相关状态
  const [stakeRecords, setStakeRecords] = useState<any[]>([]);
  const [isLoadingStakes, setIsLoadingStakes] = useState(false);
  
  // 生成内容ID
  const generateContentId = () => {
    const contentIdStr = "test-content-" + Date.now();
    return ethers.keccak256(ethers.toUtf8Bytes(contentIdStr));
  };
  
  // 获取文件列表
  const fetchFiles = async () => {
    if (!isConnected) return;
    
    try {
      setIsLoadingFiles(true);
      console.log("🔍 正在获取文件列表...");
      const response = await fetch(`/api/files?wallet_address=${account}`);
      const data = await response.json();
      
      if (data.success) {
        console.log("✅ 文件列表获取成功:", data.files);
        setFiles(data.files);
      } else {
        console.error("❌ 获取文件列表失败:", data.message);
        toast.error("获取文件列表失败");
      }
    } catch (error) {
      console.error("❌ 获取文件列表出错:", error);
      toast.error("获取文件列表出错");
    } finally {
      setIsLoadingFiles(false);
    }
  };
  
  // 获取质押记录
  const fetchStakeRecords = async () => {
    if (!isConnected || !account) return;
    
    try {
      setIsLoadingStakes(true);
      console.log("🔍 正在获取质押记录...");
      const response = await fetch(`/api/stake?wallet_address=${account}`);
      const data = await response.json();
      
      if (data.success) {
        console.log("✅ 质押记录获取成功:", data.stakes);
        setStakeRecords(data.stakes);
      } else {
        console.error("❌ 获取质押记录失败:", data.message);
        toast.error("获取质押记录失败");
      }
    } catch (error) {
      console.error("❌ 获取质押记录出错:", error);
      toast.error("获取质押记录出错");
    } finally {
      setIsLoadingStakes(false);
    }
  };
  
  // 查询余额和质押状态
  const fetchBalances = async () => {
    console.log('📞 调用fetchBalances函数:')
    console.log('   - isConnected:', isConnected)
    console.log('   - provider:', provider ? '已获取' : '未获取')
    console.log('   - account:', account)
    
    if (isConnected && provider && account) {
      try {
        setIsLoadingBalance(true);
        console.log('🔄 获取signer...')
        const signer = await provider.getSigner();
        console.log('✅ signer获取成功:', signer ? '是' : '否')
        
        // 创建合约实例
        const wzetaContract = new ethers.Contract(CONTRACT_CONFIG.WZETA_ADDR, IWZETAABI, signer);
        const managerContract = new ethers.Contract(CONTRACT_CONFIG.MANAGER_ADDR, TalkToEarnManagerABI, signer);
        
        // 1. 查询WZETA余额
        const wzetaBalance = await wzetaContract.balanceOf(account);
        const formattedWzetaBalance = ethers.formatUnits(wzetaBalance, 18);
        console.log('✅ WZETA余额:', formattedWzetaBalance);
        setUserBalance(formattedWzetaBalance);
        
        // 2. 查询已质押余额和待领取奖励
        // 如果有选定文件，使用文件ID作为contentId，否则使用随机生成的
        const contentId = selectedFile ? ethers.keccak256(ethers.toUtf8Bytes(selectedFile)) : generateContentId();
        
        console.log("🔍 开始查询质押信息：");
        console.log("   - 内容ID:", contentId);
        console.log("   - WZETA合约地址:", CONTRACT_CONFIG.WZETA_ADDR);
        console.log("   - 用户地址:", account);
        console.log("   - 文件ID:", selectedFile);
        
        try {
          // 查看质押与余额（与测试脚本相同的逻辑）
          const stakeInfo = await managerContract.stakes(contentId, CONTRACT_CONFIG.WZETA_ADDR, account);
          const formattedStakedAmount = ethers.formatUnits(stakeInfo.amount, 18);
          console.log("📊 已质押金额:", formattedStakedAmount);
          setStakedBalance(formattedStakedAmount);
          
          // 查询最新的WZETA余额
          const myWzeta = await wzetaContract.balanceOf(account);
          const formattedMyWzeta = ethers.formatUnits(myWzeta, 18);
          console.log("💼 当前WZETA余额:", formattedMyWzeta);
          
          // 尝试查询待领取奖励（如果合约支持）
          try {
            // 根据实际合约方法调整
            const pendingReward = await managerContract.pendingRewards(contentId, CONTRACT_CONFIG.WZETA_ADDR, account);
            const formattedReward = ethers.formatUnits(pendingReward, 18);
            console.log("🎁 待领取奖励:", formattedReward);
            setPendingRewards(formattedReward);
          } catch (error) {
            console.log("⚠️  未查询到待领取奖励（可能合约不支持该方法）");
            setPendingRewards("0");
          }
        } catch (error) {
          console.error("❌ 查询质押信息失败:", error);
          // 失败时使用默认值
          setStakedBalance("0");
          setPendingRewards("0");
        }
        
      } catch (error) {
        console.error('❌ 获取质押信息失败:', error);
        console.error('错误详情:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        toast.error("查询质押信息失败，请稍后重试");
      } finally {
        setIsLoadingBalance(false);
      }
    } else {
      console.log('⚠️  跳过余额查询，条件不满足')
    }
  };
  
  // 质押功能
  const handleStake = async () => {
    if (!provider || !account) {
      toast.error("请先连接钱包");
      return;
    }
    
    if (!selectedFile) {
      toast.error("请先选择一个文件");
      return;
    }
    
    if (parseFloat(stakeAmount) <= 0) {
      toast.error("请输入有效的质押金额");
      return;
    }
    
    try {
      setIsStaking(true);
      
      // 获取signer
      const signer = await provider.getSigner();
      
      // 1. 执行WZETA合约操作
      const amount = ethers.parseUnits(stakeAmount, 18);
      
      // 创建WZETA合约实例
      const wzetaContract = new ethers.Contract(CONTRACT_CONFIG.WZETA_ADDR, IWZETAABI, signer);
      
      // 检查WZETA余额
      const userWzetaBalance = await wzetaContract.balanceOf(account);
      
      // 如果WZETA余额不足，尝试从原生ZETA转换
      if (userWzetaBalance < amount) {
        const balZeta = await provider.getBalance(account);
        const wrapAmt = amount - userWzetaBalance;
        
        if (balZeta < wrapAmt) {
          toast.error(`余额不足！当前WZETA余额: ${ethers.formatUnits(userWzetaBalance, 18)}, 需要: ${ethers.formatUnits(amount, 18)}`);
          setIsStaking(false);
          return;
        }
        
        // 执行wrap操作
        toast.info(`正在将 ${ethers.formatUnits(wrapAmt, 18)} ZETA 转换为 WZETA...`);
        console.log("💧 wrapping ZETA -> WZETA:", ethers.formatUnits(wrapAmt, 18));
        await (await wzetaContract.deposit({ value: wrapAmt })).wait();
        toast.success("ZETA转换为WZETA成功！");
      }
      
      // 获取最新的WZETA余额
      const updatedWzetaBalance = await wzetaContract.balanceOf(account);
      const formattedBalance = ethers.formatUnits(updatedWzetaBalance, 18);
      
      console.log("🔍 用户WZETA余额:", {
        address: account,
        balance: formattedBalance,
        required: ethers.formatUnits(amount, 18)
      });
      
      if (updatedWzetaBalance < amount) {
        toast.error(`余额不足！当前WZETA余额: ${formattedBalance}, 需要: ${ethers.formatUnits(amount, 18)}`);
        setIsStaking(false);
        return;
      }
      
      // 更新UI显示的余额
      setUserBalance(formattedBalance);
      
      // 检查当前授权额度
      const currentAllowance = await wzetaContract.allowance(account, CONTRACT_CONFIG.MANAGER_ADDR);
      console.log("🔍 当前授权额度:", {
        from: account,
        to: CONTRACT_CONFIG.MANAGER_ADDR,
        amount: ethers.formatUnits(currentAllowance, 18),
        required: ethers.formatUnits(amount, 18)
      });
      
      // 如果授权额度不足，执行授权操作
      if (currentAllowance < amount) {
        toast.info("授权额度不足，正在执行授权操作...");
        const approveTx = await wzetaContract.approve(CONTRACT_CONFIG.MANAGER_ADDR, amount);
        await approveTx.wait();
        console.log("✅ 授权成功");
      }
      
      // 2. 执行Manager合约质押
      // 使用选定的文件ID作为contentId
      const contentId = ethers.keccak256(ethers.toUtf8Bytes(selectedFile));
      
      // 创建Manager合约实例
      const managerContract = new ethers.Contract(CONTRACT_CONFIG.MANAGER_ADDR, TalkToEarnManagerABI, signer);
      
      // 额外验证contentId格式
      console.log("🔍 ContentId验证:", {
        fileId: selectedFile,
        contentIdLength: contentId.length,
        isHex: /^0x[0-9a-fA-F]{64}$/.test(contentId)
      });
      
      console.log("🔍 准备质押:", {
        contentId: contentId,
        fileId: selectedFile,
        wzeta: CONTRACT_CONFIG.WZETA_ADDR,
        amount: ethers.formatUnits(amount, 18),
        from: account,
        manager: CONTRACT_CONFIG.MANAGER_ADDR,
        userBalance: userBalance,
        allowance: ethers.formatUnits(currentAllowance, 18)
      });
      
      toast.info("正在执行质押...");
      
      try {
        // 执行质押操作
        const stakeTx = await managerContract.stake(contentId, CONTRACT_CONFIG.WZETA_ADDR, amount);
        console.log("🔄 质押交易已发送:", stakeTx.hash);
        await stakeTx.wait();
        console.log("✅ 质押交易已确认");
      } catch (stakeError: any) {
        console.error("❌ 质押操作失败:", stakeError);
        
        // 尝试解码自定义错误
        if (stakeError.data) {
          console.error("❌ 错误数据:", stakeError.data);
          
          // 常见错误码检查
          if (stakeError.data.includes('0x08c379a0')) {
            toast.error("质押失败: 无效参数");
          } else if (stakeError.data.includes('0x11c37937') || stakeError.data.includes('0xfe382aa7')) {
            toast.error("质押失败: WZETA余额不足");
          } else if (stakeError.data.includes('0x8c5c5360')) {
            toast.error("质押失败: 授权额度不足");
          } else {
            toast.error(`质押失败: ${stakeError.reason || stakeError.message}`);
          }
        } else {
          toast.error(`质押失败: ${stakeError.reason || stakeError.message}`);
        }
        
        // 重新抛出错误以确保外层catch能捕获
        throw stakeError;
      }
      
      // 记录质押信息到数据库
      try {
        const stakeData = {
          file_id: selectedFile,
          wallet_address: account,
          amount: parseFloat(stakeAmount),
          content_id: contentId
        };
        
        console.log("🔍 正在将质押信息写入数据库:", stakeData);
        const response = await fetch('/api/stake', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(stakeData),
        });
        
        const result = await response.json();
        if (result.success) {
          console.log("✅ 质押信息成功写入数据库");
        } else {
          console.error("❌ 质押信息写入数据库失败:", result.message);
          toast.error(`质押信息写入失败: ${result.message}`);
        }
      } catch (error) {
        console.error("❌ 写入质押信息时出错:", error);
        toast.error("写入质押信息失败");
      }
      
      toast.success("质押成功！");
      
      // 更新余额显示
      await fetchBalances();
      
    } catch (error: any) {
      console.error("质押失败:", error);
      toast.error(`质押失败: ${error.message || "未知错误"}`);
    } finally {
      setIsStaking(false);
    }
  };
  
  // 赎回功能
  const handleUnstake = async () => {
    if (!provider || !account) {
      toast.error("请先连接钱包");
      return;
    }
    
    if (parseFloat(unstakeAmount) <= 0) {
      toast.error("请输入有效的赎回金额");
      return;
    }
    
    try {
      setIsUnstaking(true);
      
      // 获取signer
      const signer = await provider.getSigner();
      
      // 连接Manager合约并执行赎回
      const manager = new ethers.Contract(CONTRACT_CONFIG.MANAGER_ADDR, TalkToEarnManagerABI, signer);
      // 使用选定的文件ID作为contentId
      const contentId = selectedFile ? ethers.keccak256(ethers.toUtf8Bytes(selectedFile)) : generateContentId();
      const amount = ethers.parseUnits(unstakeAmount, 18);
      
      toast.info("正在执行赎回...");
      const unstakeTx = await manager.unstake(contentId, CONTRACT_CONFIG.WZETA_ADDR, amount);
      await unstakeTx.wait();
      
      toast.success("赎回成功！");
      
      // 更新余额显示
      await fetchBalances();
      
    } catch (error: any) {
      console.error("赎回失败:", error);
      toast.error(`赎回失败: ${error.message || "未知错误"}`);
    } finally {
      setIsUnstaking(false);
    }
  };
  
  // 领取奖励
  const handleClaimRewards = async () => {
    if (!provider || !account) {
      toast.error("请先连接钱包");
      return;
    }
    
    try {
      // 获取signer
      const signer = await provider.getSigner();
      
      // 连接Manager合约并执行领取奖励
      const manager = new ethers.Contract(CONTRACT_CONFIG.MANAGER_ADDR, TalkToEarnManagerABI, signer);
      // 使用选定的文件ID作为contentId
      const contentId = selectedFile ? ethers.keccak256(ethers.toUtf8Bytes(selectedFile)) : generateContentId();
      
      toast.info("正在领取奖励...");
      const claimTx = await manager.claim(contentId, CONTRACT_CONFIG.WZETA_ADDR);
      await claimTx.wait();
      
      toast.success("奖励领取成功！");
      
      // 更新余额显示
      await fetchBalances();
      
    } catch (error: any) {
      console.error("领取奖励失败:", error);
      toast.error(`领取奖励失败: ${error.message || "未知错误"}`);
    }
  };
  
  // 当钱包连接状态变化或文件选择变化时，更新余额
  useEffect(() => {
    if (isConnected && provider && account) {
      // 检查当前网络
      provider.getNetwork().then(network => {
        console.log("🔍 当前连接的网络:", {
          chainId: network.chainId.toString(),
          name: network.name
        });
        setCurrentNetwork(network.name);
        setChainId(network.chainId.toString());
      }).catch(error => {
        console.error("❌ 获取网络信息失败:", error);
        setCurrentNetwork("未知网络");
        setChainId("未知");
      });
      
      fetchBalances();
      fetchFiles(); // 获取文件列表
      fetchStakeRecords(); // 获取质押记录
    }
  }, [isConnected, provider, account, selectedFile]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">质押管理</h1>
          <p className="text-gray-300">管理您的 WZETA 质押</p>
        </div>
        
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧文件选择面板 */}
          <div className="lg:col-span-1">
            <Card className="bg-gray-800 border-gray-700 h-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">文章列表</h3>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={fetchFiles}
                    disabled={!isConnected || isLoadingFiles}
                    className="text-gray-300 hover:text-white"
                  >
                    {isLoadingFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span className="ml-2">刷新</span>
                  </Button>
                </div>
                
                {!isConnected ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>请先连接钱包</p>
                  </div>
                ) : isLoadingFiles ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                  </div>
                ) : files.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>暂无文件</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {files.map((file) => (
                      <div 
                        key={file.file_id}
                        className={`p-3 rounded-lg cursor-pointer transition-all ${selectedFile === file.file_id ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
                        onClick={() => setSelectedFile(file.file_id)}
                      >
                        <div className="font-medium truncate">{file.filename}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          引用次数: {file.reference_count} | 总奖励: {file.total_reward.toFixed(4)} | 累计质押: {file.total_staked?.toFixed(4) || '0.0000'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
          
          {/* 右侧质押操作面板 */}
          <div className="lg:col-span-2">
          
          {/* 钱包连接 */}
          <Card className="mb-8 bg-gray-800 border-gray-700">
            <div className="p-6">
              <div className="flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Wallet className="text-blue-400" />
                    <div>
                      <h3 className="text-lg font-semibold text-white">钱包连接</h3>
                      <p className="text-sm text-gray-400">
                        {isConnected ? 
                          `${account?.substring(0, 6)}...${account?.substring(account.length - 4)}` : 
                          "未连接"}
                      </p>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={isConnected ? undefined : connect}
                    disabled={isConnected}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isConnected ? "已连接" : "连接钱包"}
                  </Button>
                </div>
                
                {isConnected && (
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-400">当前网络:</span>
                      <span className={`text-sm font-semibold ${currentNetwork === 'zetachain' ? 'text-green-400' : 'text-red-400'}`}>
                        {currentNetwork || "未知网络"}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-400">链ID:</span>
                      <span className={`text-sm font-mono ${currentNetwork === 'zetachain' ? 'text-green-400' : 'text-red-400'}`}>
                        {chainId}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
          
          {/* 余额信息 */}
          <Card className="mb-8 bg-gray-800 border-gray-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">余额信息</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchBalances}
                  disabled={!isConnected || isLoadingBalance}
                  className="text-gray-300 hover:text-white"
                >
                  {isLoadingBalance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  <span className="ml-2">刷新</span>
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm text-gray-400">可用 WZETA</Label>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {isLoadingBalance ? <Loader2 className="h-4 w-4 animate-spin inline" /> : userBalance}
                  </div>
                </div>
                
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm text-gray-400">已质押</Label>
                  </div>
                  <div className="text-2xl font-bold text-white">{stakedBalance}</div>
                </div>
                
                <div className="bg-gray-700/50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm text-gray-400">待领取奖励</Label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleClaimRewards}
                      disabled={!isConnected || parseFloat(pendingRewards) <= 0}
                      className="text-green-400 hover:text-green-300"
                    >
                      领取
                    </Button>
                  </div>
                  <div className="text-2xl font-bold text-green-400">{pendingRewards}</div>
                </div>
              </div>
            </div>
          </Card>
          
          {/* 质押功能 */}
          <Card className="mb-8 bg-gray-800 border-gray-700">
            <div className="p-6">
              <div className="flex items-center space-x-2 mb-6">
                <ArrowUpRight className="text-green-400" />
                <h3 className="text-lg font-semibold text-white">质押 WZETA</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stake-amount" className="text-gray-300">质押金额</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="stake-amount"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="0.0001"
                      className="bg-gray-700 border-gray-600 text-white"
                    />
                    <Button 
                      variant="secondary" 
                      className="bg-gray-700 hover:bg-gray-600"
                      onClick={() => setStakeAmount(userBalance)}
                      disabled={!isConnected || parseFloat(userBalance) <= 0}
                    >
                      全部
                    </Button>
                  </div>
                </div>
                
                <Button 
                  onClick={handleStake}
                  disabled={!isConnected || isStaking || parseFloat(stakeAmount) <= 0}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isStaking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      质押中...
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="mr-2 h-4 w-4" />
                      确认质押
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
          
          {/* 已质押记录 */}
          <Card className="mb-8 bg-gray-800 border-gray-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">已质押记录</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={fetchStakeRecords}
                  disabled={!isConnected || isLoadingStakes}
                  className="text-gray-300 hover:text-white"
                >
                  {isLoadingStakes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  <span className="ml-2">刷新</span>
                </Button>
              </div>
              
              <div className="space-y-4">
                {isLoadingStakes ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                  </div>
                ) : stakeRecords.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>暂无质押记录</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {stakeRecords.map((stake) => (
                      <div key={stake.id} className="bg-gray-700/50 p-4 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-300">文件名称</span>
                          <span className="font-medium text-white truncate max-w-xs">{stake.filename || stake.file_id}</span>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-gray-300">质押金额</span>
                          <span className="font-medium text-white">{stake.amount.toFixed(6)} WZETA</span>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-gray-300">质押时间</span>
                          <span className="text-sm text-gray-400">{new Date(stake.stake_time).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
          
          {/* 赎回功能 */}
          <Card className="bg-gray-800 border-gray-700">
            <div className="p-6">
              <div className="flex items-center space-x-2 mb-6">
                <ArrowDownLeft className="text-red-400" />
                <h3 className="text-lg font-semibold text-white">赎回 WZETA</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="unstake-amount" className="text-gray-300">赎回金额</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="unstake-amount"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={unstakeAmount}
                      onChange={(e) => setUnstakeAmount(e.target.value)}
                      placeholder="0.0001"
                      className="bg-gray-700 border-gray-600 text-white"
                    />
                    <Button 
                      variant="secondary" 
                      className="bg-gray-700 hover:bg-gray-600"
                      onClick={() => setUnstakeAmount(stakedBalance)}
                      disabled={!isConnected || parseFloat(stakedBalance) <= 0}
                    >
                      全部
                    </Button>
                  </div>
                </div>
                
                <Button 
                  onClick={handleUnstake}
                  disabled={!isConnected || isUnstaking || parseFloat(unstakeAmount) <= 0}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  {isUnstaking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      赎回中...
                    </>
                  ) : (
                    <>
                      <ArrowDownLeft className="mr-2 h-4 w-4" />
                      确认赎回
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
          
          {/* 合约信息 */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>合约地址: {CONTRACT_CONFIG.MANAGER_ADDR}</p>
          </div>
        </div>
      </div>
    </main>
    </div>
  );
};

export default Staking;
