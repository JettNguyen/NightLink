import { useNavigate } from 'react-router-dom';
import './Legal.css';

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  return (
    <div className="page-container legal-page">
      <button type="button" className="legal-back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <article className="legal-card">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: May 14, 2026</p>

        <section>
          <h2>1. Data we collect</h2>
          <ul>
            <li>Contact info: name (display name) and email address.</li>
            <li>Identifiers: account and profile identifiers (for example user ID and username).</li>
            <li>User content: dreams, comments, reactions, and related activity content.</li>
            <li>Safety reports you submit (for example report reason, target content ID, and timestamp).</li>
            <li>Search history: search terms you enter inside Nightlink.</li>
            <li>Device identifiers used for notifications (for example push notification tokens on supported devices).</li>
            <li>Purchases and subscription status (for example premium entitlement and credit balance).</li>
            <li>Product interaction data needed to operate app features (for example read state and feed seen state).</li>
          </ul>
        </section>

        <section>
          <h2>2. How we use data</h2>
          <ul>
            <li>Provide core features such as journaling, social activity, notifications, and AI insights.</li>
            <li>Authenticate accounts and keep profiles in sync.</li>
            <li>Process and manage in-app purchases and subscription state.</li>
            <li>Protect the app, prevent abuse, and maintain reliability.</li>
            <li>Review and action safety reports, including removing violating content and restricting abusive users.</li>
          </ul>
        </section>

        <section>
          <h2>3. AI processing</h2>
          <p>
            Dream text submitted for AI insights is sent to external AI service providers to generate
            titles and summaries. Do not include highly sensitive personal information in prompts.
          </p>
        </section>

        <section>
          <h2>4. Service providers and data sharing</h2>
          <p>
            Nightlink uses third-party service providers to operate the app, such as Supabase
            (auth and database), AI providers (insight generation), and RevenueCat/Apple in-app
            purchase services (subscription and entitlement processing). We may also use notification
            delivery providers required to send push notifications.
          </p>
          <p>
            We share data with providers only as needed to run the app or when required by law.
          </p>
        </section>

        <section>
          <h2>5. Tracking and advertising</h2>
          <p>
            Nightlink does not use collected data for third-party advertising or data broker sharing.
            If this changes in a future version, this policy will be updated before release.
          </p>
        </section>

        <section>
          <h2>6. Retention and deletion</h2>
          <p>
            You can permanently delete your account from Settings. This removes your profile and associated app data
            from the Nightlink database.
          </p>
        </section>

        <section>
          <h2>7. Children's privacy</h2>
          <p>
            Nightlink is intended for users who are 13 years of age or older. We do not knowingly collect
            personal information from children under 13. If you believe a child under 13 has created an
            account, please contact us and we will promptly remove the account and associated data.
          </p>
        </section>

        <section>
          <h2>8. Your rights</h2>
          <p>
            Depending on your region, you may have rights to access, correct, or delete your personal data.
          </p>
          <p>
            For privacy or safety questions, contact Jett Nguyen at jettuf26@gmail.com.
          </p>
        </section>
      </article>
    </div>
  );
}
