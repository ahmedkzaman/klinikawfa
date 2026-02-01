import { Helmet } from 'react-helmet-async';

const clinicSchema = {
  '@context': 'https://schema.org',
  '@type': ['LocalBusiness', 'MedicalClinic'],
  '@id': 'https://klinikawfa.lovable.app/#clinic',
  name: 'Klinik Awfa',
  description: 'Klinik Keluarga Anda - Your Family Clinic. Providing quality healthcare services in Kuantan, Pahang.',
  url: 'https://klinikawfa.lovable.app',
  telephone: '+60182523531',
  email: 'klinikawfa@gmail.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'B2 & B4, Jalan KS 1/12, KotaSAS Avenue',
    addressLocality: 'Kuantan',
    addressRegion: 'Pahang',
    postalCode: '25200',
    addressCountry: 'MY',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 3.8077,
    longitude: 103.326,
  },
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
    opens: '08:00',
    closes: '00:00',
  },
  priceRange: 'RM',
  currenciesAccepted: 'MYR',
  paymentAccepted: 'Cash, Credit Card, Debit Card',
  image: 'https://klinikawfa.lovable.app/og-image.png',
  logo: 'https://klinikawfa.lovable.app/logo.png',
  sameAs: [
    'https://www.facebook.com/klinikawfa',
    'https://wa.me/60182523531',
  ],
  medicalSpecialty: [
    'Family Medicine',
    'General Practice',
    'Minor Surgery',
    'Ear Care',
  ],
  availableService: [
    {
      '@type': 'MedicalProcedure',
      name: 'General Consultation',
      description: 'Comprehensive health checkups and consultations',
    },
    {
      '@type': 'MedicalProcedure',
      name: 'Minor Surgery',
      description: 'Lump removal, wart treatment, and circumcision',
    },
    {
      '@type': 'MedicalProcedure',
      name: 'Ear Care',
      description: 'Microsuction ear wax removal and ear treatment',
    },
  ],
};

interface ArticleSchemaProps {
  title: string;
  description: string;
  image?: string;
  url: string;
  publishedTime?: string;
  author?: string;
}

export function SchemaMarkup() {
  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(clinicSchema)}
      </script>
    </Helmet>
  );
}

export function ArticleSchema({
  title,
  description,
  image,
  url,
  publishedTime,
  author = 'Klinik Awfa',
}: ArticleSchemaProps) {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description,
    image: image || 'https://klinikawfa.lovable.app/og-image.png',
    url: `https://klinikawfa.lovable.app${url}`,
    datePublished: publishedTime,
    author: {
      '@type': 'Organization',
      name: author,
      url: 'https://klinikawfa.lovable.app',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Klinik Awfa',
      logo: {
        '@type': 'ImageObject',
        url: 'https://klinikawfa.lovable.app/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://klinikawfa.lovable.app${url}`,
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(articleSchema)}
      </script>
    </Helmet>
  );
}
