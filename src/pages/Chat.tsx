import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, Image as ImageIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useWeb3 } from '../hooks/useWeb3';
import { executeIntent } from '../lib/blockchain';
import IntentConfirmation from '../components/IntentConfirmation';
import { Chain, Intent } from '../typs/intent';
import { CHAIN_CONFIGS } from '../lib/chains';

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SystemMessage {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  content: string;
  timestamp: Date;
}

const Chat = () => {
  const { provider, isConnected, account } = useWeb3();
  
  // 从localStorage加载聊天记录
  const loadMessagesFromStorage = (): Message[] => {
    try {
      const storedMessages = localStorage.getItem('chat_messages');
      if (storedMessages) {
        return JSON.parse(storedMessages);
      }
    } catch (error) {
      console.error('加载聊天记录失败:', error);
    }
    // 默认消息
    return [
      {
        role: "assistant",
        content: "您好！我是 AI 助手，可以帮您生成文本或图像。有什么我可以帮助您的吗？",
      },
    ];
  };
  
  const [messages, setMessages] = useState<Message[]>(loadMessagesFromStorage());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'waiting-wallet' | 'success' | 'error'>('idle');
  const [executionError, setExecutionError] = useState<string | undefined>();
  const [currentChain, setCurrentChain] = useState<Chain | null>(null);
  
  // 系统消息状态管理
  const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
  const systemMessagesEndRef = useRef<HTMLDivElement>(null);
  
  // 聊天消息滚动管理
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 添加系统消息的函数
  const addSystemMessage = (message: Omit<SystemMessage, 'id' | 'timestamp'>): SystemMessage => {
    // 使用 Date.now() 和随机数组合生成唯一 ID
    const newSystemMessage: SystemMessage = {
      ...message,
      id: 'sysmsg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };
    setSystemMessages((prev) => [...prev, newSystemMessage]);
    return newSystemMessage;
  };
  
  // 保存聊天记录到localStorage
  const saveMessagesToStorage = (messages: Message[]) => {
    try {
      localStorage.setItem('chat_messages', JSON.stringify(messages));
    } catch (error) {
      console.error('保存聊天记录失败:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => {
      const newMessages = [...prev, userMessage];
      saveMessagesToStorage(newMessages);
      return newMessages;
    });
    setInput("");
    setIsLoading(true);

    try {
      // 使用 Server-Sent Events (SSE) 连接后端 API
      // const eventSource = new EventSource(`/api/ask?q=${encodeURIComponent(input)}`);
      const eventSource = new EventSource(`/api/ask?q=${encodeURIComponent(input)}&wallet_address=${account}`);

      let responseContent = "";
      let aiMessageIndex: number | null = null;

      eventSource.onmessage = (event) => {
        const data = event.data;
        
        if (data === "[END]") {
          // 响应结束
          eventSource.close();
          setIsLoading(false);
          return;
        }

        responseContent += data;
        
        // 更新或创建 AI 消息
        if (aiMessageIndex === null) {
          // 创建新消息
          const aiMessage: Message = { role: "assistant", content: responseContent };
          setMessages((prev) => {
            const newMessages = [...prev, aiMessage];
            aiMessageIndex = newMessages.length - 1;
            saveMessagesToStorage(newMessages);
            return newMessages;
          });
        } else {
          // 更新现有消息
          setMessages((prev) => {
            const newMessages = [...prev];
            newMessages[aiMessageIndex] = { 
              ...newMessages[aiMessageIndex], 
              content: responseContent 
            };
            saveMessagesToStorage(newMessages);
            return newMessages;
          });
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE Error:", error);
        eventSource.close();
        setIsLoading(false);
        toast.error("与服务器的连接出现错误");
      };
    } catch (error) {
      console.error("Error sending message:", error);
      setIsLoading(false);
      toast.error("发送消息失败");
    }
  };

  const handleImageGeneration = () => {
    toast.info("图像生成功能即将推出！");
  };

  const handleConfirmIntent = async (intent: Intent) => {
    if (!provider) {
      addSystemMessage({
        type: 'error',
        content: '钱包未连接',
      });
      setPendingIntent(null);
      // 通知后端转账失败
      if (socket) {
        socket.emit('user_transaction_confirmation', {
          user_id: account,
          confirmed: false,
          tx_hash: null
        });
      }
      return;
    }

    setPendingIntent(null);
    setIsExecuting(true);
    setExecutionStatus('idle');
    setExecutionError(undefined);
    
    addSystemMessage({
      type: 'info',
      content: '已确认转账请求，正在执行...',
    });
    
    try {
      const signer = await provider.getSigner();
      const txHash = await executeIntent(intent, provider, signer);
      
      setExecutionStatus('success');
      
      // 获取目标链浏览器链接
      const targetChain = intent.toChain || intent.fromChain;
      const explorerUrl = targetChain 
        ? `${CHAIN_CONFIGS[targetChain].blockExplorerUrls[0]}/tx/${txHash}`
        : `https://zetascan.com/tx/${txHash}`;
      
      const isCrossChain = intent.action === 'cross_chain_transfer';
      const successContent = isCrossChain
        ? `跨链转账成功！\n\n第一步（源链锁定）已完成。\n第二步（目标链铸造）将由 ZetaChain 验证器自动执行，通常需要几分钟。\n\n交易哈希: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`
        : `转账成功！\n\n交易哈希: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
      
      addSystemMessage({
        type: 'success',
        content: successContent,
      });
      
      // 通知后端转账成功
      if (socket) {
        socket.emit('user_transaction_confirmation', {
          user_id: account,
          confirmed: true,
          tx_hash: txHash,
          transaction_id: null  // 如果有transaction_id，可以在这里添加
        });
      }
      
      // 3秒后关闭弹窗
      setTimeout(() => {
        setIsExecuting(false);
        setPendingIntent(null);
      }, 3000);
    } catch (error: any) {
      console.error('执行转账操作失败:', error);
      setExecutionStatus('error');
      setExecutionError(error.message);
      
      addSystemMessage({
        type: 'error',
        content: `转账失败: ${error.message || '未知错误'}`,
      });
      
      // 通知后端转账失败
      if (socket) {
        socket.emit('user_transaction_confirmation', {
          user_id: account,
          confirmed: false,
          tx_hash: null
        });
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelIntent = () => {
    setPendingIntent(null);
    setExecutionStatus('idle');
    setExecutionError(undefined);
    setIsExecuting(false);
    addSystemMessage({
      type: 'info',
      content: '转账请求已取消',
    });
    
    // 通知后端转账已取消
    if (socket) {
      socket.emit('user_transaction_confirmation', {
        user_id: account,
        confirmed: false,
        tx_hash: null
      });
    }
  };
  
  // 系统消息自动滚动
  useEffect(() => {
    systemMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [systemMessages.length]);
  
  // 聊天消息自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isLoading]);
  
  // Socket.IO连接状态管理
  const [socket, setSocket] = useState<any>(null);
  
  // 初始化系统消息和网络状态检查
  useEffect(() => {
    // 添加欢迎系统消息
    addSystemMessage({
      type: 'info',
      content: '欢迎使用AI对话与生成系统，您的会话已建立！',
    });
    
    // 网络状态检查
    const checkNetworkStatus = () => {
      if (!navigator.onLine) {
        addSystemMessage({
          type: 'warning',
          content: '网络连接已断开，部分功能可能无法使用。',
        });
      } else {
        addSystemMessage({
          type: 'success',
          content: '网络连接已恢复，所有功能正常使用。',
        });
      }
    };
    
    // 监听网络状态变化
    window.addEventListener('online', checkNetworkStatus);
    window.addEventListener('offline', checkNetworkStatus);
    
    return () => {
      window.removeEventListener('online', checkNetworkStatus);
      window.removeEventListener('offline', checkNetworkStatus);
    };
  }, []);
  
  // Socket.IO连接初始化
  useEffect(() => {
    // 导入socket.io-client
    import('socket.io-client').then((io) => {
      // 创建Socket.IO连接并指定命名空间
      const socket = io.default('/ws', {
        path: '/socket.io',
        transports: ['websocket'],
        timeout: 10000,
        autoConnect: true,
      });
      
      // 连接打开时
      socket.on('connect', () => {
        console.log('Socket.IO连接已建立');
        addSystemMessage({
          type: 'success',
          content: '系统消息推送已连接',
        });
        setSocket(socket);
      });
      
      // 接收系统消息时
      socket.on('system_message', (data) => {
        if (data.type === 'intent' && data.data) {
          try {
            // 解析意图数据
            const intent: Intent = {
              action: data.data.action,
              fromChain: data.data.fromChain as Chain,
              toChain: data.data.toChain as Chain,
              fromToken: data.data.fromToken,
              toToken: data.data.toToken,
              amount: data.data.amount,
              recipient: data.data.recipient,
            };
            
            // 设置待处理的意图
            setPendingIntent(intent);
            setExecutionStatus('idle');
            setExecutionError(undefined);
            setIsExecuting(false);
            
            // 添加系统消息通知用户
            addSystemMessage({
              type: 'info',
              content: `收到转账请求: ${data.data.action === 'transfer' ? '转账' : '跨链转账'} ${data.data.amount} ${data.data.fromToken}`,
            });
          } catch (error) {
            console.error('解析转账意图失败:', error);
            addSystemMessage({
              type: 'error',
              content: '解析转账请求失败',
            });
          }
        } else if (data.type && data.content) {
          // 处理普通系统消息
          addSystemMessage({
            type: data.type,
            content: data.content,
          });
        }
      });
      
      // 连接关闭时
      socket.on('disconnect', () => {
        console.log('Socket.IO连接已关闭');
        addSystemMessage({
          type: 'warning',
          content: '系统消息推送已断开',
        });
        setSocket(null);
      });
      
      // 连接错误时
      socket.on('connect_error', (error) => {
        console.error('Socket.IO错误:', error);
        addSystemMessage({
          type: 'error',
          content: '系统消息推送连接错误',
        });
      });
    }).catch((error) => {
      console.error('加载socket.io-client失败:', error);
      addSystemMessage({
        type: 'error',
        content: '系统消息推送模块加载失败',
      });
    });
    
    // 清理函数
    return () => {
      // 在组件卸载时关闭连接
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 pt-24 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              AI 对话与生成
            </h1>
            <p className="text-muted-foreground text-lg">
              使用授权的 Data NFT 进行 AI 推理和内容生成
            </p>
          </div>

          <Card className="border-border/50 bg-gradient-card backdrop-blur-sm flex h-[500px]">
            {/* 左侧：系统消息窗口 */}
            <div className="w-80 border-r border-border/50 flex flex-col bg-card">
              <div className="border-b border-border/50 px-4 py-3">
                <h3 className="text-lg font-semibold text-foreground">系统消息</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {systemMessages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">暂无系统消息</div>
                ) : (
                  systemMessages.map((message) => (
                    <div key={message.id} className={`p-3 rounded-lg border text-sm ${message.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-800' : message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : message.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                      <p>{message.content}</p>
                      <div className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</div>
                    </div>
                  ))
                )}
                <div ref={systemMessagesEndRef} />
              </div>
            </div>
            
            {/* 右侧：聊天界面 */}
            <div className="flex-1 flex flex-col bg-card">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.role === "user" ? "bg-primary text-primary-foreground shadow-glow-primary" : "bg-card border border-border/50"}`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border/50 rounded-2xl px-4 py-3">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                        <div className="w-2 h-2 rounded-full bg-secondary animate-bounce delay-100" />
                        <div className="w-2 h-2 rounded-full bg-accent animate-bounce delay-200" />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 用于自动滚动的元素 */}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-border/50 p-4">
                <div className="flex gap-2 mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/50"
                    onClick={handleImageGeneration}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    生成图像
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border/50"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    RAG 检索
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="输入您的问题或需求..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSend()}
                    className="border-border/50 bg-background/50"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={isLoading}
                    className="shadow-glow-primary"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-6 p-4 rounded-lg bg-card/30 border border-border/50">
            <p className="text-sm text-muted-foreground text-center">
              💡 所有 AI 生成结果都会记录引用的 Data NFT 来源，确保内容溯源
            </p>
          </div>
        </div>
      </main>
      
      {/* 意图确认弹窗 */}
      {pendingIntent && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl p-6 max-w-2xl w-full mx-4 border border-border shadow-2xl">
            <h3 className="text-xl font-semibold text-foreground mb-4">确认转账操作</h3>
            <IntentConfirmation
              intent={pendingIntent}
              onConfirm={handleConfirmIntent}
              onCancel={handleCancelIntent}
              isExecuting={isExecuting}
              executionStatus={executionStatus}
              errorMessage={executionError}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
