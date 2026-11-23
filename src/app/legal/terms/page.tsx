import { LegalPage, CONTACT_EMAIL } from "@/components/legal-page";

export const metadata = { title: "Terms of Service · Cast" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="November 2026">
      <h2>Using Cast</h2>
      <p>You must be at least 13 years old (or the minimum age in your country) to use Cast. You are responsible for your account and for what you post.</p>
      <h2>Your content</h2>
      <p>You keep ownership of the videos and posts you upload. By posting, you give Cast a worldwide, non-exclusive, royalty-free license to host, store, show, and distribute your content on Cast and to promote Cast. You can delete your content at any time, which ends this license except for copies others have already shared or that we must keep by law.</p>
      <p>You may only upload content you made or have the rights to post.</p>
      <h2>Rules</h2>
      <ul>
        <li>No illegal content, harassment, hate, threats, or sexual content involving minors.</li>
        <li>No spam, fake engagement, or impersonation.</li>
        <li>No content that infringes someone else&apos;s copyright or trademark.</li>
      </ul>
      <p>We may remove content or suspend accounts that break these rules.</p>
      <h2>Subscriptions and payments</h2>
      <p>Paid features are not available during the beta. Separate payment terms will apply when they launch.</p>
      <h2>Disclaimers</h2>
      <p>Cast is provided &quot;as is&quot; during the beta and may change or have interruptions. To the extent the law allows, Cast is not liable for indirect or consequential losses.</p>
      <h2>Contact</h2>
      <p>Questions: {CONTACT_EMAIL}.</p>
    </LegalPage>
  );
}
