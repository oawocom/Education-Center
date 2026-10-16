'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getToken } from '@/edu/utils/api';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getToken() ? '/dashboard' : '/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
    </div>
  );
}
