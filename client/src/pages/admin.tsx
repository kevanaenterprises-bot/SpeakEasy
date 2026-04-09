import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Trash2, KeyRound, ShieldCheck, UserX, UserCheck, LogOut, ArrowLeft } from "lucide-react";
import turtleLogo from "@assets/generated_images/Girl_turtle_talking_on_phone_d147f854.png";

const LANGUAGES: Record<string, string> = {
  en: "🇺🇸 English", vi: "🇻🇳 Vietnamese", es: "🇪🇸 Spanish", fr: "🇫🇷 French",
  de: "🇩🇪 German", it: "🇮🇹 Italian", pt: "🇧🇷 Portuguese", ru: "🇷🇺 Russian",
  ja: "🇯🇵 Japanese", ko: "🇰🇷 Korean", zh: "🇨🇳 Chinese", ar: "🇸🇦 Arabic",
  hi: "🇮🇳 Hindi", th: "🇹🇭 Thai",
};

interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
  language: string;
  isActive: boolean;
  createdAt: string;
}

function AddUserModal({ onAdd, onClose }: { onAdd: () => void; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password, role, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "User created!", description: `${displayName} can now log in.` });
      onAdd();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="w-5 h-5" /> Add New User</CardTitle>
          <CardDescription>Create a SpeakEasy account for a team member</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Display Name</label>
              <Input placeholder="e.g. Dave from Accounting" value={displayName} onChange={e => setDisplayName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Username</label>
              <Input placeholder="e.g. dave.accounting" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <Input type="password" placeholder="Assign a password..." value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Role</label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Language</label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(LANGUAGES).map(([code, label]) => (
                      <SelectItem key={code} value={code}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={!username || !displayName || !password || loading}>
                {loading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      if (!res.ok) throw new Error("Failed to reset password");
      toast({ title: "Password reset!", description: `${user.displayName}'s password has been updated.` });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Reset Password</CardTitle>
          <CardDescription>Set a new password for <strong>{user.displayName}</strong></CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input type="password" placeholder="New password..." value={password} onChange={e => setPassword(e.target.value)} autoFocus />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={!password || loading}>
                {loading ? "Saving..." : "Reset Password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<AppUser | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const fetchUsers = async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  };

  useEffect(() => {
    // Check admin auth
    fetch("/api/auth/me").then(async res => {
      if (!res.ok) { navigate("/"); return; }
      const data = await res.json();
      if (data.user.role !== "admin") { navigate("/"); return; }
      setCurrentAdmin(data.user);
      await fetchUsers();
      setLoading(false);
    });
  }, []);

  const toggleActive = async (user: AppUser) => {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    if (res.ok) {
      await fetchUsers();
      toast({ title: user.isActive ? "Account disabled" : "Account enabled", description: user.displayName });
    }
  };

  const deleteUser = async (user: AppUser) => {
    if (!confirm(`Delete ${user.displayName}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchUsers();
      toast({ title: "User deleted", description: user.displayName });
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const regularUsers = users.filter(u => u.role !== "admin");
  const adminUsers = users.filter(u => u.role === "admin");

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800">
      {showAddUser && <AddUserModal onAdd={fetchUsers} onClose={() => setShowAddUser(false)} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => { setResetTarget(null); }} />}

      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-full overflow-hidden">
              <img src={turtleLogo} alt="SpeakEasy" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold">SpeakEasy Admin</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {currentAdmin?.displayName}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> App
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" /> Logout
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="text-center p-4">
            <div className="text-2xl font-bold text-primary">{regularUsers.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Users</div>
          </Card>
          <Card className="text-center p-4">
            <div className="text-2xl font-bold text-green-500">{regularUsers.filter(u => u.isActive).length}</div>
            <div className="text-xs text-muted-foreground mt-1">Active</div>
          </Card>
          <Card className="text-center p-4">
            <div className="text-2xl font-bold text-red-400">{regularUsers.filter(u => !u.isActive).length}</div>
            <div className="text-xs text-muted-foreground mt-1">Disabled</div>
          </Card>
        </div>

        {/* User list */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> User Accounts
              </CardTitle>
              <Button size="sm" onClick={() => setShowAddUser(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add User
              </Button>
            </div>
            <CardDescription>Manage who has access to SpeakEasy</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {regularUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No users yet.</p>
                <p className="text-xs mt-1">Click "Add User" to create the first account.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {regularUsers.map(user => (
                  <div key={user.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${user.isActive ? 'bg-background' : 'bg-muted/40 opacity-60'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {user.displayName[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{user.displayName}</p>
                          {!user.isActive && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Disabled</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">@{user.username} · {LANGUAGES[user.language]}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="w-8 h-8" title="Reset password" onClick={() => setResetTarget(user)}>
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8" title={user.isActive ? "Disable account" : "Enable account"} onClick={() => toggleActive(user)}>
                        {user.isActive ? <UserX className="w-4 h-4 text-orange-500" /> : <UserCheck className="w-4 h-4 text-green-500" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive" title="Delete user" onClick={() => deleteUser(user)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Admin accounts (read-only) */}
            {adminUsers.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Admin accounts
                </p>
                {adminUsers.map(user => (
                  <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg bg-primary/5">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                      {user.displayName[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground">@{user.username} · Admin</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          SpeakEasy Admin Panel · Turtle Logistics LLC 🐢
        </p>
      </div>
    </div>
  );
}
