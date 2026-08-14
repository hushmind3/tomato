import './globals.css';
import './interview.css';

export const metadata = { title: 'Tomato Matching', description: '사람, 팀, 일, 기업, 협업 등을 연결합니다.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
