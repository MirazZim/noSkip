import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Zap, Eye, EyeOff } from "lucide-react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [primaryFocus, setPrimaryFocus] = useState("Spending discipline");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        navigate("/");
      }
    } else {
      if (!agree) {
        toast({
          title: "Accept the terms",
          description: "Please agree to the terms to create an account.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await signUp(email, password, { name, primaryFocus });
      if (error) {
        toast({
          title: "Sign up failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Check your email",
          description:
            "We sent you a confirmation link to verify your account.",
        });
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center">
        {/* Left: Brand + copy + tiny preview */}
        <div className="space-y-6 text-slate-50">
          <div className="inline-flex items-center gap-3 rounded-full bg-slate-900/60 border border-slate-700/60 px-3 py-1 text-xs font-medium text-slate-300">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
              <Zap className="h-3 w-3 text-emerald-400" />
            </span>
            NoSkip · Track habits and spending together
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              What gets tracked, gets improved.
            </h1>
            <p className="text-slate-300 text-sm md:text-base max-w-lg">
              Log your daily expenses and habits side by side in one clear
              dashboard. Build financial discipline and consistent routines
              without juggling multiple apps.
            </p>
          </div>

          {/* Tiny preview card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 max-w-md shadow-lg shadow-slate-950/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-300">
                Today at a glance
              </span>
              <span className="text-[10px] text-emerald-400">
                Expenses · Habits
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Expenses mini chart */}
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-3">
                <p className="text-[11px] text-slate-300 mb-2">Spending</p>
                <div className="flex items-end gap-1 h-16">
                  <div className="w-1.5 rounded-full bg-emerald-500/50 h-4" />
                  <div className="w-1.5 rounded-full bg-emerald-500/60 h-7" />
                  <div className="w-1.5 rounded-full bg-emerald-500/80 h-10" />
                  <div className="w-1.5 rounded-full bg-emerald-500/40 h-5" />
                  <div className="w-1.5 rounded-full bg-emerald-500/70 h-8" />
                </div>
              </div>
              {/* Habits streak mini view */}
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-3">
                <p className="text-[11px] text-slate-300 mb-2">Habit streak</p>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-3 w-3 rounded-[5px] ${
                        i < 9
                          ? "bg-emerald-500/70"
                          : i < 11
                          ? "bg-emerald-500/30"
                          : "bg-slate-800"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Auth card */}
        <Card className="border-slate-800/80 bg-slate-950/80 backdrop-blur shadow-xl shadow-slate-950/50">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/40">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs tracking-[0.18em] uppercase text-slate-400">
                  NoSkip
                </span>
                <span className="text-sm font-medium text-slate-100">
                  Unified habit & expense tracking
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <CardTitle className="text-xl font-semibold text-slate-50">
                {isLogin ? "Welcome back" : "Create your NoSkip account"}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {isLogin
                  ? "Sign in to continue improving your financial and personal habits."
                  : "Start tracking your spending and habits side by side in one dashboard."}
              </CardDescription>
            </div>

            {/* Toggle buttons */}
            <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-900/80 p-1">
              <button
                type="button"
                onClick={() => setIsLogin(true)}
                className={`rounded-full py-1.5 text-xs font-medium transition ${
                  isLogin
                    ? "bg-slate-950 text-slate-50 shadow-sm"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className={`rounded-full py-1.5 text-xs font-medium transition ${
                  !isLogin
                    ? "bg-slate-950 text-slate-50 shadow-sm"
                    : "text-slate-400 hover:text-slate-100"
                }`}
              >
                Create account
              </button>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs text-slate-200">
                      Name
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Alex Rahman"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="primaryFocus"
                      className="text-xs text-slate-200"
                    >
                      Primary focus
                    </Label>
                    <select
                      id="primaryFocus"
                      className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                      value={primaryFocus}
                      onChange={(e) => setPrimaryFocus(e.target.value)}
                    >
                      <option value="Spending discipline">
                        Spending discipline
                      </option>
                      <option value="Habit consistency">
                        Habit consistency
                      </option>
                      <option value="Both equally">Both equally</option>
                    </select>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-slate-200">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs text-slate-200">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {isLogin && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-slate-200 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {!isLogin && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="agree"
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-emerald-500"
                  />
                  <Label
                    htmlFor="agree"
                    className="text-xs text-slate-400 font-normal"
                  >
                    I agree to the{" "}
                    <span className="underline decoration-dotted">
                      terms and privacy policy
                    </span>
                    .
                  </Label>
                </div>
              )}

              <Button
                type="submit"
                className="w-full mt-2"
                disabled={loading}
              >
                {loading
                  ? "Please wait..."
                  : isLogin
                  ? "Sign in"
                  : "Create account"}
              </Button>

              <div className="mt-3 text-center text-xs text-slate-400">
                {isLogin ? "New to NoSkip?" : "Already using NoSkip?"}{" "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-emerald-400 hover:underline font-medium"
                >
                  {isLogin ? "Create an account" : "Sign in"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
