import NavBar from "@/components/NavBar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
