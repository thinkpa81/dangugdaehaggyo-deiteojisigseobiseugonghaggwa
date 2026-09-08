import { useEffect, useState } from "react";
import { Bell, BookOpen, ClipboardList, Images, KeyRound, LockKeyhole, Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Link } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LoginModal from "@/components/LoginModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { notifyAuthChanged, useSession } from "@/hooks/use-session";

type AdminAccount = Awaited<ReturnType<typeof api.admins.list>>[number];

const emptyAccountForm = { username: "", name: "", password: "", confirmPassword: "" };

export default function Admin() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resetId, setResetId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [bootstrapExpiresAt, setBootstrapExpiresAt] = useState<string | null>(null);
  const [bootstrapForm, setBootstrapForm] = useState({ setupCode: "", username: "", name: "", password: "", confirmPassword: "" });
  const { user, loading: sessionLoading, refresh } = useSession();
  const isAdmin = user?.role === "ADMIN";

  const loadBootstrapStatus = async () => {
    try {
      const status = await api.adminBootstrap.status();
      setBootstrapRequired(status.required);
      setBootstrapExpiresAt(status.expiresAt);
    } catch {
      setBootstrapRequired(false);
    }
  };

  const loadAdmins = async () => {
    setLoading(true);
    setError("");
    try {
      setAdmins(await api.admins.list());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "관리자 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBootstrapStatus();
  }, []);

  useEffect(() => {
    if (isAdmin) void loadAdmins();
    else if (!sessionLoading) setLoading(false);
  }, [isAdmin, sessionLoading]);

  const validatePasswordPair = (password: string, confirmation: string) => {
    if (password.length < 10) {
      window.alert("비밀번호는 10자 이상으로 입력해 주세요.");
      return false;
    }
    if (password !== confirmation) {
      window.alert("비밀번호 확인이 일치하지 않습니다.");
      return false;
    }
    return true;
  };

  const setupFirstAdmin = async () => {
    if (!bootstrapForm.setupCode.trim() || !bootstrapForm.username.trim() || !bootstrapForm.name.trim()) {
      window.alert("초기 설정 코드, 관리자 아이디와 이름을 입력해 주세요.");
      return;
    }
    if (!validatePasswordPair(bootstrapForm.password, bootstrapForm.confirmPassword)) return;

    setSaving(true);
    try {
      await api.adminBootstrap.setup({
        setupCode: bootstrapForm.setupCode.trim(),
        username: bootstrapForm.username.trim(),
        name: bootstrapForm.name.trim(),
        password: bootstrapForm.password,
      });
      notifyAuthChanged();
      await refresh();
      setBootstrapRequired(false);
      setBootstrapForm({ setupCode: "", username: "", name: "", password: "", confirmPassword: "" });
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "최초 관리자 설정에 실패했습니다.");
      await loadBootstrapStatus();
    } finally {
      setSaving(false);
    }
  };

  const createAdmin = async () => {
    if (!accountForm.username.trim() || !accountForm.name.trim()) {
      window.alert("관리자 아이디와 이름을 입력해 주세요.");
      return;
    }
    if (!validatePasswordPair(accountForm.password, accountForm.confirmPassword)) return;
    setSaving(true);
    try {
      await api.admins.create({
        username: accountForm.username.trim(),
        name: accountForm.name.trim(),
        password: accountForm.password,
      });
      setCreateOpen(false);
      setAccountForm(emptyAccountForm);
      await loadAdmins();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "관리자 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    if (resetId === null || !validatePasswordPair(resetPassword, resetPasswordConfirm)) return;
    setSaving(true);
    try {
      const changedCurrentAccount = resetId === user?.id;
      await api.admins.resetPassword(resetId, resetPassword);
      setResetId(null);
      setResetPassword("");
      setResetPasswordConfirm("");
      if (changedCurrentAccount) {
        notifyAuthChanged();
        await refresh();
        window.alert("비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요.");
      } else {
        window.alert("관리자 비밀번호를 안전하게 변경했습니다.");
      }
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAdmin = async () => {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await api.admins.delete(deleteId);
      setDeleteId(null);
      await loadAdmins();
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "관리자 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />

      <main className="flex-1 py-12 lg:py-16">
        <div className="mx-auto max-w-[1100px] px-5 sm:px-8 lg:px-10">
          <div className="mb-8 border-b-2 border-slate-900 pb-6">
            <p className="text-sm font-bold tracking-[0.1em] text-[#2156D9]">SITE ADMINISTRATION</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">관리자</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              홈페이지 게시물과 관리자 계정을 관리합니다. 비밀번호는 서버에서 scrypt 해시로만 저장됩니다.
            </p>
          </div>

          {!sessionLoading && !isAdmin && bootstrapRequired && (
            <Card className="mx-auto max-w-2xl rounded-xl border-slate-200 shadow-[0_12px_35px_rgba(15,35,64,0.08)]">
              <CardHeader className="border-b border-slate-200">
                <CardTitle className="flex items-center gap-3 text-xl font-black">
                  <ShieldCheck className="h-6 w-6 text-[#2156D9]" aria-hidden="true" />
                  최초 관리자 안전 설정
                </CardTitle>
                <p className="pt-2 text-sm leading-6 text-slate-600">
                  관리자 계정이 없는 경우에만 한 번 사용할 수 있습니다. Render 배포 로그의
                  <strong className="mx-1 text-slate-900">admin_bootstrap</strong> 항목에서 15분 유효 설정 코드를 확인해 입력하세요.
                </p>
                {bootstrapExpiresAt && <p className="text-xs text-slate-500">설정 코드 만료: {new Date(bootstrapExpiresAt).toLocaleString("ko-KR")}</p>}
              </CardHeader>
              <CardContent className="p-6 sm:p-8">
                <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void setupFirstAdmin(); }}>
                <div className="space-y-2">
                  <Label htmlFor="setup-code" className="font-bold">일회성 설정 코드</Label>
                  <Input id="setup-code" type="password" autoComplete="off" value={bootstrapForm.setupCode} onChange={(event) => setBootstrapForm({ ...bootstrapForm, setupCode: event.target.value })} className="h-11 rounded-md" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="setup-username" className="font-bold">관리자 아이디</Label>
                    <Input id="setup-username" autoComplete="username" value={bootstrapForm.username} onChange={(event) => setBootstrapForm({ ...bootstrapForm, username: event.target.value })} className="h-11 rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="setup-name" className="font-bold">표시 이름</Label>
                    <Input id="setup-name" value={bootstrapForm.name} onChange={(event) => setBootstrapForm({ ...bootstrapForm, name: event.target.value })} className="h-11 rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="setup-password" className="font-bold">비밀번호</Label>
                    <Input id="setup-password" type="password" autoComplete="new-password" value={bootstrapForm.password} onChange={(event) => setBootstrapForm({ ...bootstrapForm, password: event.target.value })} className="h-11 rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="setup-password-confirm" className="font-bold">비밀번호 확인</Label>
                    <Input id="setup-password-confirm" type="password" autoComplete="new-password" value={bootstrapForm.confirmPassword} onChange={(event) => setBootstrapForm({ ...bootstrapForm, confirmPassword: event.target.value })} className="h-11 rounded-md" />
                  </div>
                </div>
                <Button type="submit" disabled={saving} className="h-12 w-full rounded-md bg-[#2156D9] font-bold hover:bg-[#1848bc]">
                  {saving ? "설정 중..." : "최초 관리자 설정"}
                </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {!sessionLoading && !isAdmin && !bootstrapRequired && (
            <Card className="mx-auto max-w-xl rounded-xl border-slate-200 text-center shadow-[0_12px_35px_rgba(15,35,64,0.08)]">
              <CardContent className="px-6 py-12">
                <LockKeyhole className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
                <h2 className="mt-5 text-2xl font-black text-slate-900">관리자 로그인이 필요합니다</h2>
                <p className="mt-3 text-base text-slate-600">권한이 있는 계정으로 로그인한 후 이용할 수 있습니다.</p>
                <Button onClick={() => setLoginOpen(true)} className="mt-6 h-11 rounded-md bg-[#2156D9] px-6 font-bold hover:bg-[#1848bc]">관리자 로그인</Button>
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <div className="space-y-8">
              <section aria-labelledby="content-management-heading">
                <h2 id="content-management-heading" className="mb-4 text-xl font-black text-slate-900">콘텐츠 관리</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Button variant="outline" asChild className="h-auto min-h-24 justify-start rounded-xl border-slate-200 bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50/40">
                    <Link href="/notices"><Bell className="mr-3 h-5 w-5 shrink-0 text-[#2156D9]" aria-hidden="true" /><span><strong className="block text-base text-slate-900">공지사항</strong><span className="mt-1 block text-sm font-normal text-slate-500">등록·수정·삭제</span></span></Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto min-h-24 justify-start rounded-xl border-slate-200 bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50/40">
                    <Link href="/papers"><BookOpen className="mr-3 h-5 w-5 shrink-0 text-[#2156D9]" aria-hidden="true" /><span><strong className="block text-base text-slate-900">논문</strong><span className="mt-1 block text-sm font-normal text-slate-500">등록·수정·삭제</span></span></Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto min-h-24 justify-start rounded-xl border-slate-200 bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50/40">
                    <Link href="/admissions/guidelines"><ClipboardList className="mr-3 h-5 w-5 shrink-0 text-[#2156D9]" aria-hidden="true" /><span><strong className="block text-base text-slate-900">입학안내 · 모집요강</strong><span className="mt-1 block text-sm font-normal text-slate-500">등록·수정·삭제</span></span></Link>
                  </Button>
                  <Button variant="outline" asChild className="h-auto min-h-24 justify-start rounded-xl border-slate-200 bg-white p-5 text-left shadow-sm hover:border-blue-200 hover:bg-blue-50/40">
                    <Link href="/photos"><Images className="mr-3 h-5 w-5 shrink-0 text-[#2156D9]" aria-hidden="true" /><span><strong className="block text-base text-slate-900">사진자료실</strong><span className="mt-1 block text-sm font-normal text-slate-500">등록·수정·삭제</span></span></Link>
                  </Button>
                </div>
              </section>

              <Card className="rounded-xl border-slate-200 shadow-[0_12px_35px_rgba(15,35,64,0.08)]">
              <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-200">
                <div>
                  <CardTitle className="text-xl font-black">관리자 계정</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">현재 로그인: {user.username}</p>
                </div>
                <Button onClick={() => { setAccountForm(emptyAccountForm); setCreateOpen(true); }} className="h-11 rounded-md bg-[#2156D9] px-5 font-bold hover:bg-[#1848bc]">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />관리자 추가
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loading && <p className="px-6 py-12 text-center text-slate-500">관리자 목록을 불러오는 중입니다.</p>}
                {!loading && error && <p className="px-6 py-12 text-center font-semibold text-rose-700">{error}</p>}
                {!loading && !error && (
                  <div className="divide-y divide-slate-200">
                    {admins.map((admin) => (
                      <article key={admin.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                        <div className="flex items-center gap-4">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#2156D9]"><UserCog className="h-5 w-5" aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-slate-900">{admin.name}{admin.id === user.id && <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs text-[#2156D9]">현재 계정</span>}</h3>
                            <p className="mt-1 break-words text-sm text-slate-500">{admin.username} · {admin.status === "active" ? "활성" : "중지"} · {admin.registeredAt}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 sm:justify-end">
                          <Button variant="outline" size="sm" onClick={() => { setResetId(admin.id); setResetPassword(""); setResetPasswordConfirm(""); }} className="h-11 rounded-md font-bold">
                            <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />비밀번호 변경
                          </Button>
                          <Button variant="outline" size="sm" disabled={admin.id === user.id} onClick={() => setDeleteId(admin.id)} className="h-11 rounded-md border-rose-200 font-bold text-rose-700 hover:bg-rose-50 hover:text-rose-800">
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />삭제
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!saving) setCreateOpen(open); }}>
        <DialogContent className="rounded-xl sm:max-w-lg">
          <DialogHeader><DialogTitle className="text-xl font-black">관리자 추가</DialogTitle><DialogDescription>새 관리자는 게시물과 다른 관리자 계정을 관리할 수 있습니다.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void createAdmin(); }}>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="new-admin-username" className="font-bold">아이디</Label><Input id="new-admin-username" autoComplete="username" value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} className="h-11 rounded-md" /></div>
            <div className="space-y-2"><Label htmlFor="new-admin-name" className="font-bold">표시 이름</Label><Input id="new-admin-name" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} className="h-11 rounded-md" /></div>
            <div className="space-y-2"><Label htmlFor="new-admin-password" className="font-bold">비밀번호</Label><Input id="new-admin-password" type="password" autoComplete="new-password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} className="h-11 rounded-md" /></div>
            <div className="space-y-2"><Label htmlFor="new-admin-confirm" className="font-bold">비밀번호 확인</Label><Input id="new-admin-confirm" type="password" autoComplete="new-password" value={accountForm.confirmPassword} onChange={(event) => setAccountForm({ ...accountForm, confirmPassword: event.target.value })} className="h-11 rounded-md" /></div>
          </div>
          <div className="mt-5 flex gap-3"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={saving} className="h-11 flex-1 rounded-md">취소</Button><Button type="submit" disabled={saving} className="h-11 flex-1 rounded-md bg-[#2156D9] font-bold hover:bg-[#1848bc]">{saving ? "등록 중..." : "관리자 등록"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resetId !== null} onOpenChange={(open) => { if (!open && !saving) setResetId(null); }}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader><DialogTitle className="text-xl font-black">관리자 비밀번호 변경</DialogTitle><DialogDescription>새 비밀번호는 10자 이상 입력해 주세요.</DialogDescription></DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void updatePassword(); }}>
          <div className="mt-3 space-y-2"><Label htmlFor="reset-admin-password" className="font-bold">새 비밀번호</Label><Input id="reset-admin-password" type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} className="h-11 rounded-md" /></div>
          <div className="mt-4 space-y-2"><Label htmlFor="reset-admin-password-confirm" className="font-bold">새 비밀번호 확인</Label><Input id="reset-admin-password-confirm" type="password" autoComplete="new-password" value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} className="h-11 rounded-md" /></div>
          <div className="mt-5 flex gap-3"><Button type="button" variant="outline" onClick={() => setResetId(null)} disabled={saving} className="h-11 flex-1 rounded-md">취소</Button><Button type="submit" disabled={saving} className="h-11 flex-1 rounded-md bg-[#2156D9] font-bold hover:bg-[#1848bc]">변경</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteId(null); }}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader><AlertDialogTitle>관리자 계정을 삭제하시겠습니까?</AlertDialogTitle><AlertDialogDescription>삭제한 계정은 즉시 관리자 기능을 사용할 수 없습니다. 현재 계정과 마지막 활성 관리자는 삭제할 수 없습니다.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleting} className="h-11 rounded-md">취소</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); void deleteAdmin(); }} className="h-11 rounded-md bg-rose-700 text-white hover:bg-rose-800">{deleting ? "삭제 중..." : "삭제"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}
