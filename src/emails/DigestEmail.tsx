import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface DigestEmailProps {
  userName: string;
  campus: string;
  topResources: Array<{ title: string; course: string; upvotes: number }>;
  openSessionsCount: number;
}

export default function DigestEmail({
  userName = 'Student',
  campus = 'Your Campus',
  topResources = [],
  openSessionsCount = 0,
}: DigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your weekly MBAAntisocial digest for {campus}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Weekly Digest</Heading>
          <Text style={text}>Hi {userName},</Text>
          <Text style={text}>
            Here is what&rsquo;s happening at <strong>{campus}</strong> this week on MBAAntisocial.
          </Text>

          <Section style={section}>
            <Heading as="h2" style={h2}>Top Resources</Heading>
            {topResources.length > 0 ? (
              topResources.map((res, i) => (
                <Text key={i} style={listItem}>
                  • <strong>{res.title}</strong> ({res.course}) — {res.upvotes} upvotes
                </Text>
              ))
            ) : (
              <Text style={text}>No new resources this week.</Text>
            )}
          </Section>

          <Hr style={hr} />

          <Section style={section}>
            <Heading as="h2" style={h2}>Mock Sessions</Heading>
            <Text style={text}>
              There are currently <strong>{openSessionsCount}</strong> open mock sessions available for booking.
            </Text>
            <Link href="https://mbaantisocial.com/sessions" style={button}>
              Book a session
            </Link>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Sent by MBAAntisocial. To unsubscribe, update your notification preferences in the app.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const section = {
  padding: '0 24px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '40px',
  padding: '0 24px',
};

const h2 = {
  color: '#333',
  fontSize: '20px',
  fontWeight: '600',
  lineHeight: '28px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '24px',
  padding: '0 24px',
};

const listItem = {
  color: '#333',
  fontSize: '15px',
  lineHeight: '22px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const button = {
  backgroundColor: '#000',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  padding: '0 24px',
};
