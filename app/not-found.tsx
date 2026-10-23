import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="empty" style={{ marginTop: 40 }}>
        <strong>That page isn't in today's edition</strong>
        <Link href="/">Back to the front page</Link>
      </div>
    </div>
  );
}
