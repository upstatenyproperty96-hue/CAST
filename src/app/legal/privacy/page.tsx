import { LegalPage, CONTACT_EMAIL } from "@/components/legal-page";

export const metadata = { title: "Privacy Policy · Cast" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="November 2026">
      <h2>What we collect</h2>
      <ul>
        <li>Account details: email address, name, handle, profile photo, and bio.</li>
        <li>Content you post: videos, posts, comments, likes, reposts, playlists.</li>
        <li>Activity: who you follow, what you watch and for how long, used for your feed and for creator analytics.</li>
        <li>Technical data: device and browser type and IP address, used for security and to prevent abuse.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To run Cast, personalize your feed, show creators how their videos perform (as totals, not who watched), keep the service safe, and contact you about your account. We do not sell your personal information.</p>
      <h2>Who we share it with</h2>
      <p>Service providers that run Cast for us: Supabase (database and sign-in), Mux (video hosting and playback), and Vercel (web hosting). When payments launch, Stripe will process them. We share information if the law requires it.</p>
      <h2>Your choices</h2>
      <ul>
        <li>Hide your Likes tab in Edit profile.</li>
        <li>Delete your videos and posts at any time.</li>
        <li>Ask us to export or delete your account by emailing {CONTACT_EMAIL}.</li>
      </ul>
      <h2>Children</h2>
      <p>Cast is not for children under 13, and we delete accounts we learn belong to them.</p>
    </LegalPage>
  );
}
