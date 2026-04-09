import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import turtleLogo from "@assets/generated_images/Girl_turtle_talking_on_phone_d147f854.png";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Users, Heart, Shuffle, Copy, UserCircle, BookUser, Plus, Trash2, Share2, LogOut, MessageSquare, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Language configs ──────────────────────────────────────────────────────────
const LANGUAGES: Record<string, { name: string; flag: string }> = {
  en: { name: "English", flag: "🇺🇸" },
  vi: { name: "Tiếng Việt", flag: "🇻🇳" },
  es: { name: "Español", flag: "🇪🇸" },
  fr: { name: "Français", flag: "🇫🇷" },
  de: { name: "Deutsch", flag: "🇩🇪" },
  it: { name: "Italiano", flag: "🇮🇹" },
  pt: { name: "Português", flag: "🇧🇷" },
  ru: { name: "Русский", flag: "🇷🇺" },
  ja: { name: "日本語", flag: "🇯🇵" },
  ko: { name: "한국어", flag: "🇰🇷" },
  zh: { name: "中文", flag: "🇨🇳" },
  ar: { name: "العربية", flag: "🇸🇦" },
  hi: { name: "हिन्दी", flag: "🇮🇳" },
  th: { name: "ไทย", flag: "🇹🇭" },
};

// ── Multilingual instructions for sharing ────────────────────────────────────
const SHARE_INSTRUCTIONS: Record<string, string> = {
  en: (roomId: string, appUrl: string) =>
    `Hey! I want to video call you on SpeakEasy — it translates our conversation live!\n\n1. Go to: ${appUrl}\n2. Enter this Room Code: ${roomId}\n3. Click "Join Call"\n\nThat's it — see you there! 🐢`,
  vi: (roomId: string, appUrl: string) =>
    `Xin chào! Tôi muốn gọi video cho bạn qua SpeakEasy — ứng dụng dịch cuộc trò chuyện của chúng ta trực tiếp!\n\n1. Truy cập: ${appUrl}\n2. Nhập mã phòng: ${roomId}\n3. Nhấn "Join Call"\n\nHẹn gặp bạn! 🐢`,
  es: (roomId: string, appUrl: string) =>
    `¡Hola! Quiero hacer una videollamada contigo en SpeakEasy — ¡traduce nuestra conversación en vivo!\n\n1. Ve a: ${appUrl}\n2. Ingresa el código de sala: ${roomId}\n3. Haz clic en "Join Call"\n\n¡Nos vemos! 🐢`,
  fr: (roomId: string, appUrl: string) =>
    `Salut ! Je veux t'appeler en vidéo sur SpeakEasy — il traduit notre conversation en direct !\n\n1. Va sur : ${appUrl}\n2. Entre le code de salle : ${roomId}\n3. Clique sur "Join Call"\n\nÀ tout de suite ! 🐢`,
  de: (roomId: string, appUrl: string) =>
    `Hallo! Ich möchte dich über SpeakEasy per Video anrufen — es übersetzt unser Gespräch live!\n\n1. Gehe zu: ${appUrl}\n2. Gib den Raumcode ein: ${roomId}\n3. Klicke auf "Join Call"\n\nBis gleich! 🐢`,
  it: (roomId: string, appUrl: string) =>
    `Ciao! Voglio fare una videochiamata con te su SpeakEasy — traduce la nostra conversazione in tempo reale!\n\n1. Vai su: ${appUrl}\n2. Inserisci il codice stanza: ${roomId}\n3. Clicca su "Join Call"\n\nA presto! 🐢`,
  pt: (roomId: string, appUrl: string) =>
    `Olá! Quero fazer uma videochamada com você no SpeakEasy — ele traduz nossa conversa ao vivo!\n\n1. Acesse: ${appUrl}\n2. Digite o código da sala: ${roomId}\n3. Clique em "Join Call"\n\nTe vejo lá! 🐢`,
  ru: (roomId: string, appUrl: string) =>
    `Привет! Хочу позвонить тебе по видео в SpeakEasy — приложение переводит наш разговор в реальном времени!\n\n1. Перейди на: ${appUrl}\n2. Введи код комнаты: ${roomId}\n3. Нажми "Join Call"\n\nДо встречи! 🐢`,
  ja: (roomId: string, appUrl: string) =>
    `こんにちは！SpeakEasyでビデオ通話しましょう — 会話をリアルタイムで翻訳します！\n\n1. アクセス: ${appUrl}\n2. ルームコードを入力: ${roomId}\n3. "Join Call"をクリック\n\nお待ちしています！🐢`,
  ko: (roomId: string, appUrl: string) =>
    `안녕하세요! SpeakEasy로 영상통화 해요 — 대화를 실시간으로 번역해줘요!\n\n1. 접속: ${appUrl}\n2. 방 코드 입력: ${roomId}\n3. "Join Call" 클릭\n\n곧 만나요! 🐢`,
  zh: (roomId: string, appUrl: string) =>
    `你好！我想通过SpeakEasy与你视频通话 — 它能实时翻译我们的对话！\n\n1. 访问: ${appUrl}\n2. 输入房间码: ${roomId}\n3. 点击"Join Call"\n\n见！🐢`,
  ar: (roomId: string, appUrl: string) =>
    `مرحباً! أريد مكالمة فيديو معك على SpeakEasy — يترجم محادثتنا مباشرة!\n\n1. اذهب إلى: ${appUrl}\n2. أدخل كود الغرفة: ${roomId}\n3. اضغط "Join Call"\n\nأراك قريباً! 🐢`,
  hi: (roomId: string, appUrl: string) =>
    `नमस्ते! मैं SpeakEasy पर आपसे वीडियो कॉल करना चाहता हूं — यह हमारी बातचीत का लाइव अनुवाद करता है!\n\n1. यहाँ जाएं: ${appUrl}\n2. रूम कोड दर्ज करें: ${roomId}\n3. "Join Call" पर क्लिक करें\n\nमिलते हैं! 🐢`,
  th: (roomId: string, appUrl: string) =>
    `สวัสดี! อยากโทรวิดีโอหาคุณผ่าน SpeakEasy — แปลการสนทนาของเรา live!\n\n1. ไปที่: ${appUrl}\n2. ใส่รหัสห้อง: ${roomId}\n3. คลิก "Join Call"\n\nเจอกันเลย! 🐢`,
};

interface Contact {
  id: string;
  name: string;
  phone: string;
  language: string;
}

// ── Storage helpers ────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  currentUser: "speakeasy-user",
  contacts: "speakeasy-contacts",
  roomId: "speakeasy-roomId",
  isHost: "speakeasy-isHost",
  settings: "speakeasy-settings",
};

function getContacts(): Contact[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.contacts) || "[]");
  } catch { return []; }
}

function saveContacts(contacts: Contact[]) {
  localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(contacts));
}

// ── Sign-in screen ─────────────────────────────────────────────────────────────
function SignInScreen({ onSignIn }: { onSignIn: (user: any) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); return; }
      onSignIn(data.user);
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-sm p-6">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center overflow-hidden shadow-lg">
              <img src={turtleLogo} alt="SpeakEasy" className="w-full h-full object-cover rounded-full" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">SpeakEasy</h1>
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            <span>Video calls with</span>
            <Heart className="w-4 h-4 text-red-500" />
            <span>live translation</span>
          </p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <UserCircle className="w-5 h-5" /> Sign In
            </CardTitle>
            <CardDescription>Use the credentials your admin provided</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded">{error}</p>}
              <div className="space-y-1">
                <label className="text-sm font-medium">Username</label>
                <Input type="text" placeholder="Enter your username..." value={username} onChange={e => setUsername(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Password</label>
                <Input type="password" placeholder="Enter your password..." value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={!username || !password || loading}>
                <Phone className="w-4 h-4 mr-2" />
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Add Contact Modal ──────────────────────────────────────────────────────────
function AddContactModal({ onAdd, onClose }: { onAdd: (c: Contact) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("en");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onAdd({ id: Date.now().toString(), name: name.trim(), phone: phone.trim(), language });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Add Contact</CardTitle>
          <CardDescription>Save someone to your SpeakEasy phonebook</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input placeholder="Contact name..." value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Phone (for SMS sharing)</label>
              <Input placeholder="+1 (555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Their Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LANGUAGES).map(([code, lang]) => (
                    <SelectItem key={code} value={code}>
                      {lang.flag} {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={!name.trim()}>Add Contact</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Home Screen ───────────────────────────────────────────────────────────
export default function Home() {
  const [currentUser, setCurrentUser] = useState<{ name: string; language: string } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [roomId, setRoomId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [showPhonebook, setShowPhonebook] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Check server session on mount
  useEffect(() => {
    fetch("/api/auth/me").then(async res => {
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        // Load contacts from localStorage keyed by user ID
        const savedContacts = localStorage.getItem(`${STORAGE_KEYS.contacts}-${data.user.id}`);
        if (savedContacts) { try { setContacts(JSON.parse(savedContacts)); } catch {} }
        setShowPhonebook(true);
      }
    });
    const savedRoomId = localStorage.getItem(STORAGE_KEYS.roomId);
    const savedIsHost = localStorage.getItem(STORAGE_KEYS.isHost);
    if (savedRoomId) { setRoomId(savedRoomId); setIsHost(savedIsHost === "true"); }
  }, []);

  const handleSignIn = (user: any) => {
    setCurrentUser(user);
    const savedContacts = localStorage.getItem(`${STORAGE_KEYS.contacts}-${user.id}`);
    if (savedContacts) { try { setContacts(JSON.parse(savedContacts)); } catch {} }
    setShowPhonebook(true);
    toast({ title: `Welcome, ${user.displayName}! 🐢`, description: "Your phonebook is ready." });
  };

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setContacts([]);
    setShowPhonebook(false);
  };

  const generateRoomId = () => {
    const newRoomId = `room-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    setRoomId(newRoomId);
    setIsHost(true);
    localStorage.setItem(STORAGE_KEYS.roomId, newRoomId);
    localStorage.setItem(STORAGE_KEYS.isHost, "true");
    toast({ title: "Room Created!", description: "Share this code with whoever you're calling." });
  };

  const handleRoomIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRoomId(e.target.value);
    setIsHost(false);
    localStorage.setItem(STORAGE_KEYS.isHost, "false");
  };

  const copyRoomId = () => {
    if (roomId.trim()) {
      navigator.clipboard.writeText(roomId);
      toast({ title: "Room Code Copied!", description: "Share it with your contact." });
    }
  };

  const shareWithContact = (contact: Contact) => {
    if (!roomId.trim()) {
      toast({ title: "No room code yet", description: "Generate a room code first, then share.", variant: "destructive" });
      return;
    }
    const appUrl = window.location.origin;
    const langFn = SHARE_INSTRUCTIONS[contact.language] || SHARE_INSTRUCTIONS.en;
    const message = langFn(roomId, appUrl);

    if (contact.phone) {
      // Open SMS with pre-filled message in their language
      window.open(`sms:${contact.phone}?body=${encodeURIComponent(message)}`, "_blank");
    } else {
      // Copy to clipboard if no phone number
      navigator.clipboard.writeText(message);
      toast({ title: `Message copied in ${LANGUAGES[contact.language]?.name}!`, description: "Paste it to send to " + contact.name });
    }
  };

  const addContact = (contact: Contact) => {
    const updated = [...contacts, contact];
    setContacts(updated);
    if (currentUser) localStorage.setItem(`${STORAGE_KEYS.contacts}-${currentUser.id}`, JSON.stringify(updated));
    toast({ title: "Contact Added!", description: `${contact.name} is in your phonebook.` });
  };

  const deleteContact = (id: string) => {
    const updated = contacts.filter(c => c.id !== id);
    setContacts(updated);
    if (currentUser) localStorage.setItem(`${STORAGE_KEYS.contacts}-${currentUser.id}`, JSON.stringify(updated));
  };

  const saveLanguageAndNavigate = (targetRoomId: string) => {
    const settings = { yourLanguage: (currentUser as any)?.language || 'en', partnerLanguage: 'vi' };
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    navigate(`/call/${targetRoomId}`);
  };

  const startCall = () => {
    const id = roomId.trim() || `room-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    saveLanguageAndNavigate(id);
  };

  const joinCall = () => {
    if (roomId.trim()) saveLanguageAndNavigate(roomId.trim());
  };

  // Show sign-in screen if not logged in
  if (!currentUser) {
    return <SignInScreen onSignIn={handleSignIn} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800">
      {/* Add Contact Modal */}
      {showAddContact && (
        <AddContactModal onAdd={addContact} onClose={() => setShowAddContact(false)} />
      )}

      <div className="max-w-md mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center overflow-hidden shadow-lg">
              <img src={turtleLogo} alt="SpeakEasy" className="w-full h-full object-cover rounded-full" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-1">SpeakEasy</h1>
          <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
            <span>Video calls with</span>
            <Heart className="w-3 h-3 text-red-500" />
            <span>live translation</span>
          </p>
          {/* User badge */}
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
              {LANGUAGES[currentUser.language]?.flag} {currentUser.displayName}
            </span>
            {currentUser.role === "admin" && (
              <button onClick={() => navigate("/admin")} className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Admin
              </button>
            )}
            <button onClick={handleSignOut} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
        </div>

        {/* Room setup */}
        <Card className="mb-4">
          <CardHeader className="text-center pb-3">
            <CardTitle className="flex items-center justify-center gap-2 text-lg">
              <Users className="w-5 h-5" />
              Start or Join a Call
            </CardTitle>
            <CardDescription>Generate a room code and share it, or enter one you received</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={isHost ? "Your room code — share this!" : "Enter room code to join..."}
                value={roomId}
                onChange={handleRoomIdChange}
                onKeyDown={e => e.key === 'Enter' && joinCall()}
                className="flex-1 font-mono text-sm"
              />
              {!isHost && (
                <Button onClick={generateRoomId} variant="outline" size="icon" title="Generate room code">
                  <Shuffle className="w-4 h-4" />
                </Button>
              )}
              {roomId.trim() && (
                <Button onClick={copyRoomId} variant="outline" size="icon" title="Copy room code">
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </div>

            {isHost ? (
              <div className="space-y-2">
                <Button onClick={startCall} className="w-full" disabled={!roomId.trim()}>
                  <Phone className="w-4 h-4 mr-2" /> Start Call
                </Button>
                <Button onClick={() => { setRoomId(""); setIsHost(false); }} variant="ghost" className="w-full text-muted-foreground text-sm">
                  <Shuffle className="w-4 h-4 mr-2" /> Generate New Code
                </Button>
              </div>
            ) : (
              <Button onClick={joinCall} className="w-full" disabled={!roomId.trim()}
                variant={roomId.trim() ? "default" : "outline"}>
                <Users className="w-4 h-4 mr-2" />
                {roomId.trim() ? "Join Call" : "Enter a Room Code Above"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Phonebook */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookUser className="w-5 h-5" />
                My Phonebook
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowAddContact(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowPhonebook(!showPhonebook)}>
                  {showPhonebook ? "Hide" : "Show"}
                </Button>
              </div>
            </div>
            <CardDescription>
              Tap <Share2 className="w-3 h-3 inline" /> to send them the room code in their language
            </CardDescription>
          </CardHeader>

          {showPhonebook && (
            <CardContent className="pt-0">
              {contacts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <BookUser className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No contacts yet.</p>
                  <p className="text-xs mt-1">Add someone to share room codes in their language.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {contacts.map(contact => (
                    <div key={contact.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                          {LANGUAGES[contact.language]?.flag}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {LANGUAGES[contact.language]?.name}{contact.phone ? ` · ${contact.phone}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-primary hover:text-primary"
                          onClick={() => shareWithContact(contact)}
                          title={`Share room code in ${LANGUAGES[contact.language]?.name}`}
                        >
                          {contact.phone ? <MessageSquare className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-destructive hover:text-destructive"
                          onClick={() => deleteContact(contact.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          SpeakEasy · 14 Languages · Powered by Turtle Logistics 🐢
        </p>
      </div>
    </div>
  );
}
