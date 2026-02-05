import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
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
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 4, 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using Gunner ("the Service"), you agree to be bound by these Terms of Service ("Terms"). 
              If you disagree with any part of the terms, you may not access the Service. These Terms apply to all visitors, 
              users, and others who access or use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Gunner is an AI-powered sales call coaching platform that provides call recording analysis, grading, 
              and coaching feedback for sales teams. The Service includes features such as AI call grading, 
              team performance analytics, CRM integration, and training materials.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Account Registration</h2>
            <p className="text-muted-foreground leading-relaxed">
              To use certain features of the Service, you must register for an account. You agree to provide accurate, 
              current, and complete information during registration and to update such information to keep it accurate, 
              current, and complete. You are responsible for safeguarding your password and for all activities that occur 
              under your account. You agree to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Subscription and Billing</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is offered on a subscription basis. By subscribing, you agree to pay the applicable fees for 
              your selected plan. Subscriptions automatically renew unless canceled before the renewal date. You may 
              cancel your subscription at any time through your account settings. Refunds are provided in accordance 
              with our refund policy.
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Free trials require a valid payment method</li>
              <li>You will be charged at the end of your trial period unless you cancel</li>
              <li>Subscription fees are non-refundable except as required by law</li>
              <li>We reserve the right to change pricing with 30 days notice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Acceptable Use</h2>
            <p className="text-muted-foreground leading-relaxed">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-4 space-y-2">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on the rights of others, including privacy and intellectual property rights</li>
              <li>Upload or transmit viruses, malware, or other malicious code</li>
              <li>Attempt to gain unauthorized access to the Service or its related systems</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Record calls without proper consent from all parties as required by applicable law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Data and Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to 
              the collection, use, and sharing of your information as described in the Privacy Policy. You are 
              responsible for ensuring that you have obtained all necessary consents from individuals whose call 
              recordings are processed through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service and its original content, features, and functionality are owned by Gunner and are protected 
              by international copyright, trademark, patent, trade secret, and other intellectual property laws. 
              You retain ownership of any content you upload to the Service, but grant us a license to use, store, 
              and process that content to provide the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the maximum extent permitted by law, Gunner shall not be liable for any indirect, incidental, special, 
              consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or 
              indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of 
              the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Service is provided "as is" and "as available" without warranties of any kind, either express or 
              implied, including but not limited to implied warranties of merchantability, fitness for a particular 
              purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, secure, or 
              error-free.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may terminate or suspend your account and access to the Service immediately, without prior notice or 
              liability, for any reason, including breach of these Terms. Upon termination, your right to use the 
              Service will immediately cease. All provisions of these Terms which by their nature should survive 
              termination shall survive.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify or replace these Terms at any time. If a revision is material, we will 
              provide at least 30 days notice prior to any new terms taking effect. What constitutes a material change 
              will be determined at our sole discretion. By continuing to access or use the Service after revisions 
              become effective, you agree to be bound by the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="text-muted-foreground mt-4">
              <strong>Email:</strong> support@getgunner.ai<br />
              <strong>Website:</strong> https://getgunner.ai
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
