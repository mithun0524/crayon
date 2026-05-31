import React from 'react';
import LegalLayout from '../../components/LegalLayout';

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="May 30, 2026">
      <p>
        At Crayon Inc., we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our autonomous software engineering tools.
      </p>
      
      <h2>1. Information We Collect</h2>
      <p>
        <strong>Code and Repository Data:</strong> When you connect Crayon to your repositories, we analyze your code to provide autonomous engineering services. This code is never used to train our foundational models without explicit opt-in.
      </p>
      <p>
        <strong>Account Information:</strong> We collect your name, email address, and billing information when you register for an account.
      </p>

      <h2>2. How We Use Your Information</h2>
      <p>
        We use the information we collect primarily to provide, maintain, protect, and improve our current products and to develop new ones. We also use this information to offer you tailored content and proactive autonomous code improvements.
      </p>

      <h2>3. Data Security</h2>
      <p>
        We implement a variety of security measures to maintain the safety of your personal information. All code analysis is performed in isolated, ephemeral sandbox environments that are destroyed immediately after task completion.
      </p>

      <h2>4. Contact Us</h2>
      <p>
        If you have questions or comments about this Privacy Policy, please contact us at: <a href="mailto:privacy@crayon.dev">privacy@crayon.dev</a>.
      </p>
    </LegalLayout>
  );
}
