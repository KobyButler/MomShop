import "./globals.css";
import AdminShell from "@/components/admin/AdminShell";

export const metadata = {
    title: "Crossroads Custom Apparel",
    description: "Screen printing & embroidery order management"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <AdminShell>{children}</AdminShell>
            </body>
        </html>
    );
}
