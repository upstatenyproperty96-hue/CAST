import { LegalPage, CONTACT_EMAIL } from "@/components/legal-page";

export const metadata = { title: "Copyright · Cast" };

export default function Copyright() {
  return (
    <LegalPage title="Copyright and takedown requests" updated="November 2026">
      <p>Cast respects creators&apos; rights. If you believe a video on Cast uses your copyrighted work without permission, send a notice to {CONTACT_EMAIL} with:</p>
      <ul>
        <li>Your name and contact details, and your physical or electronic signature.</li>
        <li>A description of the work you own.</li>
        <li>The Cast link to the content you want removed.</li>
        <li>A statement that you believe in good faith the use is not authorized.</li>
        <li>A statement, under penalty of perjury, that your notice is accurate and you are the owner or authorized to act for the owner.</li>
      </ul>
      <p>We remove content that is the subject of a valid notice and tell the uploader. Uploaders may send a counter-notice if they believe the removal was a mistake. Accounts with repeated infringements are closed.</p>
    </LegalPage>
  );
}
