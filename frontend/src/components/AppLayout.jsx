import { Sidebar, MobileSidebar } from "./Sidebar";
import { Navbar } from "./Navbar";

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="md:pl-64 flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>
      <MobileSidebar />
    </div>
  );
}
