import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('compliance')
export class ComplianceController {
  /**
   * Get Terms of Service
   * GET /compliance/terms
   */
  @Get('terms')
  @HttpCode(HttpStatus.OK)
  async getTermsOfService() {
    return {
      success: true,
      data: {
        title: 'Terms of Service',
        lastUpdated: '2024-01-15',
        version: '1.0',
        content: {
          introduction: 'Welcome to Aussie Markets. By accessing and using our platform, you agree to be bound by these Terms of Service.',
          sections: [
            {
              title: '1. Acceptance of Terms',
              content: 'By creating an account and using Aussie Markets, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our Privacy Policy.',
            },
            {
              title: '2. Eligibility',
              content: 'You must be at least 18 years old and a resident of Australia to use our services. You must provide accurate and complete information during registration.',
            },
            {
              title: '3. Account Responsibilities',
              content: 'You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.',
            },
            {
              title: '4. Prohibited Activities',
              content: 'You may not use our platform for illegal activities, market manipulation, money laundering, or any activity that violates Australian law.',
            },
            {
              title: '5. Financial Regulations',
              content: 'Aussie Markets operates in compliance with Australian financial regulations. All transactions are subject to applicable taxes and reporting requirements.',
            },
            {
              title: '6. Market Resolution',
              content: 'Market outcomes are determined by our resolution team based on verifiable sources. Resolution decisions are final and binding.',
            },
            {
              title: '7. Fees and Charges',
              content: 'We may charge fees for trading, deposits, withdrawals, and other services. All fees will be clearly disclosed before you complete any transaction.',
            },
            {
              title: '8. Limitation of Liability',
              content: 'Aussie Markets liability is limited to the maximum extent permitted by Australian law. We are not liable for market losses or trading decisions.',
            },
            {
              title: '9. Termination',
              content: 'We may suspend or terminate your account at any time for violation of these terms or applicable law.',
            },
            {
              title: '10. Changes to Terms',
              content: 'We may modify these terms at any time. Continued use of the platform constitutes acceptance of modified terms.',
            },
          ],
        },
      },
    };
  }

  /**
   * Get Privacy Policy
   * GET /compliance/privacy
   */
  @Get('privacy')
  @HttpCode(HttpStatus.OK)
  async getPrivacyPolicy() {
    return {
      success: true,
      data: {
        title: 'Privacy Policy',
        lastUpdated: '2024-01-15',
        version: '1.0',
        content: {
          introduction: 'This Privacy Policy explains how Aussie Markets collects, uses, and protects your personal information.',
          sections: [
            {
              title: '1. Information We Collect',
              content: 'We collect personal information including your name, email, phone number, identity verification documents, transaction history, and device information.',
            },
            {
              title: '2. How We Use Your Information',
              content: 'We use your information to provide our services, verify your identity, comply with legal obligations, prevent fraud, and improve our platform.',
            },
            {
              title: '3. Information Sharing',
              content: 'We may share your information with regulatory authorities, law enforcement, service providers, and as required by law. We do not sell your personal information.',
            },
            {
              title: '4. Data Security',
              content: 'We implement industry-standard security measures to protect your personal information, including encryption, secure servers, and access controls.',
            },
            {
              title: '5. Your Rights',
              content: 'You have the right to access, correct, or delete your personal information, subject to legal and regulatory requirements.',
            },
            {
              title: '6. Cookies and Tracking',
              content: 'We use cookies and similar technologies to improve your experience, analyze usage, and provide personalized services.',
            },
            {
              title: '7. Data Retention',
              content: 'We retain your information for as long as necessary to provide our services and comply with legal obligations.',
            },
            {
              title: '8. International Transfers',
              content: 'Your information may be processed in countries outside Australia, but we ensure appropriate safeguards are in place.',
            },
            {
              title: '9. Children\'s Privacy',
              content: 'Our services are not intended for children under 18. We do not knowingly collect information from children.',
            },
            {
              title: '10. Contact Us',
              content: 'If you have questions about this Privacy Policy, please contact us at privacy@aussiemarkets.com.au.',
            },
          ],
        },
      },
    };
  }

  /**
   * Get Responsible Gambling Information
   * GET /compliance/responsible-gambling
   */
  @Get('responsible-gambling')
  @HttpCode(HttpStatus.OK)
  async getResponsibleGambling() {
    return {
      success: true,
      data: {
        title: 'Responsible Gambling',
        lastUpdated: '2024-01-15',
        version: '1.0',
        content: {
          introduction: 'Aussie Markets is committed to promoting responsible gambling and providing tools to help you maintain control.',
          sections: [
            {
              title: 'What is Responsible Gambling?',
              content: 'Responsible gambling means making informed decisions about when, where, and how much to bet while maintaining control over your gambling activities.',
            },
            {
              title: 'Setting Limits',
              content: 'You can set daily, weekly, and monthly deposit limits through your account settings. These limits help you stay within your budget.',
            },
            {
              title: 'Self-Exclusion',
              content: 'If you need a break from gambling, you can self-exclude from our platform for a period of your choosing. During self-exclusion, you cannot access trading features.',
            },
            {
              title: 'Cool-Off Periods',
              content: 'Take short breaks with our cool-off feature, which temporarily restricts your account for 24 hours to 7 days.',
            },
            {
              title: 'Warning Signs',
              content: 'Be aware of signs that gambling may be affecting your life: spending more than you can afford, chasing losses, lying about gambling, or neglecting responsibilities.',
            },
            {
              title: 'Getting Help',
              content: 'If you need support with gambling-related issues, contact Gambling Help Online at 1800 858 858 or visit gamblinghelponline.org.au.',
            },
            {
              title: 'Resources and Support',
              content: 'Additional resources include Gambler\'s Help services, counseling programs, and financial counseling services available across Australia.',
            },
          ],
          helplines: [
            {
              name: 'Gambling Help Online',
              phone: '1800 858 858',
              website: 'gamblinghelponline.org.au',
              description: '24/7 counseling and support services',
            },
            {
              name: 'Lifeline',
              phone: '13 11 14',
              website: 'lifeline.org.au',
              description: 'Crisis support and suicide prevention',
            },
            {
              name: 'Beyond Blue',
              phone: '1300 22 4636',
              website: 'beyondblue.org.au',
              description: 'Mental health support and information',
            },
          ],
        },
      },
    };
  }

  /**
   * Get Licensing Information
   * GET /compliance/licensing
   */
  @Get('licensing')
  @HttpCode(HttpStatus.OK)
  async getLicensingInfo() {
    return {
      success: true,
      data: {
        title: 'Licensing Information',
        lastUpdated: '2024-01-15',
        content: {
          introduction: 'Aussie Markets operates under Australian financial services regulations and licensing requirements.',
          sections: [
            {
              title: 'Regulatory Compliance',
              content: 'Aussie Markets is committed to operating in full compliance with Australian Securities and Investments Commission (ASIC) regulations and the Corporations Act 2001.',
            },
            {
              title: 'Financial Services License',
              content: 'Our operations are conducted under the appropriate Australian Financial Services License (AFSL). License details are available upon request.',
            },
            {
              title: 'Consumer Protection',
              content: 'As a licensed operator, we maintain professional indemnity insurance and participate in the Australian Financial Complaints Authority (AFCA) external dispute resolution scheme.',
            },
            {
              title: 'Anti-Money Laundering',
              content: 'We comply with the Anti-Money Laundering and Counter-Terrorism Financing Act 2006 (AML/CTF Act) and maintain robust customer identification and transaction monitoring systems.',
            },
            {
              title: 'Tax Obligations',
              content: 'All winnings may be subject to Australian taxation. We recommend consulting with a tax professional regarding your obligations.',
            },
          ],
          contacts: {
            regulator: 'Australian Securities and Investments Commission (ASIC)',
            website: 'asic.gov.au',
            complaints: 'Australian Financial Complaints Authority (AFCA)',
            complaintsWebsite: 'afca.org.au',
            complaintsPhone: '1800 931 678',
          },
        },
      },
    };
  }

  /**
   * Get Support Information
   * GET /compliance/support
   */
  @Get('support')
  @HttpCode(HttpStatus.OK)
  async getSupportInfo() {
    return {
      success: true,
      data: {
        title: 'Customer Support',
        content: {
          introduction: 'We\'re here to help with any questions or issues you may have with Aussie Markets.',
          methods: [
            {
              type: 'Email Support',
              contact: 'support@aussiemarkets.com.au',
              description: 'For general inquiries and account assistance',
              responseTime: 'Within 24 hours during business days',
            },
            {
              type: 'Technical Support',
              contact: 'tech@aussiemarkets.com.au',
              description: 'For technical issues and platform problems',
              responseTime: 'Within 12 hours during business days',
            },
            {
              type: 'Compliance Inquiries',
              contact: 'compliance@aussiemarkets.com.au',
              description: 'For regulatory and compliance questions',
              responseTime: 'Within 48 hours during business days',
            },
            {
              type: 'Live Chat',
              description: 'Available in the mobile app during business hours',
              hours: 'Monday to Friday, 9 AM to 5 PM AEST',
            },
          ],
          businessHours: 'Monday to Friday, 9:00 AM to 5:00 PM AEST (excluding public holidays)',
          emergencyContact: 'For urgent security or fraud-related issues, please email security@aussiemarkets.com.au',
        },
      },
    };
  }

  /**
   * Submit support request
   * POST /compliance/support/contact
   */
  @Get('support/contact')
  @HttpCode(HttpStatus.OK)
  async getContactForm() {
    return {
      success: true,
      data: {
        title: 'Contact Us',
        message: 'For support requests, please email us directly at support@aussiemarkets.com.au or use the in-app chat feature.',
        emailTemplate: {
          to: 'support@aussiemarkets.com.au',
          subject: 'Aussie Markets Support Request',
          template: `
Dear Aussie Markets Support Team,

I am contacting you regarding: [Brief description of your issue]

Account Details:
- Email: [Your registered email]
- User ID: [If known]

Issue Description:
[Detailed description of your issue or question]

Steps Taken:
[What you've already tried to resolve the issue]

Additional Information:
[Any other relevant details]

Thank you for your assistance.

Best regards,
[Your name]
          `,
        },
      },
    };
  }
}
