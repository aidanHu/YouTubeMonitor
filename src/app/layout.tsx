import type { Metadata } from "next";
import "./globals.css";
import { DownloadProvider } from "@/context/DownloadContext";

import { DataProvider } from "@/context/DataContext";
import { GlobalCookieInjector } from "@/components/GlobalCookieInjector";

export const metadata: Metadata = {
    title: "YouTube Channel Monitor",
    description: "Monitor and analyze your favorite YouTube channels",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className="font-sans">
                <DataProvider>
                    <DownloadProvider>
                        <GlobalCookieInjector />
                        {children}
                    </DownloadProvider>
                </DataProvider>
            </body>
        </html >
    );
}
