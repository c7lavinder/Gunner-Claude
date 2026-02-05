import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <nav className="border-b bg-background sticky top-0 z-10">
        <div className="container flex h-16 items-center">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="container max-w-4xl py-12">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 4, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Gunner ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how 
              we collect, use, disclose, and safeguard your information when you use our AI-powered sales call coaching 
              platform ("Service"). Please read this policy carefully. By using the Service, you consent to the data 
              practices described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            
            <h3 className="text-xl font-medium mt-6 mb-3">2.1 Information You Provide</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>Account Information:</strong> Name, email address, company name, password, and billing information</li>
              <li><strong>Call Recordings:</strong> Audio recordings of sales calls that you upload or sync through CRM integrations</li>
              <li><strong>Team Information:</strong> Names and email addresses of team members you invite</li>
              <li><strong>Communication:</strong> Messages you send to us for support or feedback</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">2.2 Information Collected Automatically</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent on the Service</li>
              <li><strong>Device Information:</strong> Browser type, operating system, IP address</li>
              <li><strong>Cookies:</strong> Session cookies for authentication and preferences</li>
            </ul>

            <h3 className="text-xl font-medium mt-6 mb-3">2.3 Information from Third Parties</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-2">
              <li><strong>CRM Data:</strong> Contact information and call data from integrated CRM systems (e.g., GoHighLevel)</li>
              <li><strong>Authentication Providers:</strong> Profile information from Google OAuth if you choose to sign in with Google</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process and analyze call recordings using AI to provide grading and coaching feedback</li>
              <li>Generate performance analytics and reports for your team</li>
              <li>Process payments and manage subscriptions</li>
              <li>Send transactional emails (account verification, password reset, billing)</li>
              <li>Send product updates and marketing communications (with your consent)</li>
              <li>Respond to your inquiries and provide customer support</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. AI Processing of Call Recordings</h2>
            <p className="text-muted-foreground leading-relaxed">
              Our Service uses artificial intelligence to analyze and grade sales calls. This processing includes:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Transcription of audio recordings to text</li>
              <li>Analysis of conversation content, tone, and structure</li>
              <li>Scoring based on customizable rubrics and criteria</li>
              <li>Generation of coaching feedback and recommendations</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You are responsible for ensuring that you have obtained all necessary consents from individuals whose 
              calls are recorded and processed through our Service, in compliance with applicable laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Data Sharing and Disclosure</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may share your information in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li><strong>Service Providers:</strong> Third-party vendors who assist in providing the Service (hosting, payment processing, AI processing)</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
              <li><strong>With Your Consent:</strong> When you have given us permission to share your information</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organizational measures to protect your information, including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Encryption of data in transit and at rest</li>
              <li>Secure authentication and access controls</li>
              <li>Regular security assessments and monitoring</li>
              <li>Employee training on data protection</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              However, no method of transmission over the Internet or electronic storage is 100% secure. We cannot 
              guarantee absolute security of your information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide the Service. 
              Call recordings are retained according to your plan's storage limits. You may request deletion of your 
              data at any time by contacting us. We will retain and use your information as necessary to comply with 
              legal obligations, resolve disputes, and enforce our agreements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Depending on your location, you may have the following rights:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li><strong>Access:</strong> Request a copy of your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Opt-out:</strong> Opt out of marketing communications</li>
              <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              To exercise these rights, please contact us at privacy@getgunner.ai.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use cookies and similar tracking technologies to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Maintain your session and authentication state</li>
              <li>Remember your preferences</li>
              <li>Analyze usage patterns to improve the Service</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              You can control cookies through your browser settings. Disabling cookies may affect the functionality 
              of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is not intended for individuals under the age of 18. We do not knowingly collect personal 
              information from children. If you become aware that a child has provided us with personal information, 
              please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. International Data Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your information may be transferred to and processed in countries other than your country of residence. 
              These countries may have different data protection laws. We take appropriate safeguards to ensure your 
              information remains protected in accordance with this Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the 
              new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this 
              Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="text-muted-foreground mt-4">
              <strong>Email:</strong> privacy@getgunner.ai<br />
              <strong>Support:</strong> support@getgunner.ai<br />
              <strong>Website:</strong> https://getgunner.ai
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
