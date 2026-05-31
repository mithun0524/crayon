import React from 'react';
import LegalLayout from '../../components/LegalLayout';

export default function Security() {
  return (
    <LegalLayout title="Security" lastUpdated="May 30, 2026">
      <p>
        Security is at the core of Crayon's architecture. Because our agents interact directly with your source code and execute terminal commands, we have built military-grade isolation to protect your assets.
      </p>

      <h2>Ephemeral Sandboxing</h2>
      <p>
        Every task executed by Crayon runs in a strictly isolated, ephemeral MicroVM. Once the agent completes its task or the timeout is reached, the VM is instantly destroyed. No state is shared between tasks or between users.
      </p>

      <h2>Zero Data Retention Policy for Code</h2>
      <p>
        We do not store your proprietary source code on our servers longer than necessary to complete the requested agent task. Your codebase is <strong>never</strong> used to train our base models.
      </p>

      <h2>Vulnerability Disclosure</h2>
      <p>
        If you believe you have discovered a vulnerability in Crayon, please email us immediately at <a href="mailto:security@crayon.dev">security@crayon.dev</a>. We operate a private bug bounty program and will respond within 24 hours.
      </p>
    </LegalLayout>
  );
}
