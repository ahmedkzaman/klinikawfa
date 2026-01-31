import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CLINIC_INFO, SERVICES } from '@/lib/constants';
import { Calendar, Clock, Phone, MessageCircle, MapPin, CheckCircle } from 'lucide-react';
import { useState } from 'react';

export default function Appointment() {
  const { language, t } = useLanguage();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    service: '',
    date: '',
    time: '',
    message: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // For now, just show success state
    // TODO: Save to Lovable Cloud database when enabled
    setIsSubmitted(true);
  };

  const getWhatsAppMessage = () => {
    const msg = language === 'ms'
      ? `Salam, saya ingin membuat temujanji.\n\nNama: ${formData.name}\nNo. Telefon: ${formData.phone}\nPerkhidmatan: ${formData.service}\nTarikh Pilihan: ${formData.date}\nMasa Pilihan: ${formData.time}\n${formData.message ? `Mesej: ${formData.message}` : ''}`
      : `Hello, I would like to make an appointment.\n\nName: ${formData.name}\nPhone: ${formData.phone}\nService: ${formData.service}\nPreferred Date: ${formData.date}\nPreferred Time: ${formData.time}\n${formData.message ? `Message: ${formData.message}` : ''}`;
    return encodeURIComponent(msg);
  };

  if (isSubmitted) {
    return (
      <MainLayout>
        <section className="py-16 md:py-24">
          <div className="container">
            <Card className="mx-auto max-w-lg border-success/30 bg-success/5">
              <CardContent className="p-8 text-center">
                <div className="mb-6 flex justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-success-foreground">
                    <CheckCircle className="h-8 w-8" />
                  </div>
                </div>
                <h2 className="mb-4 text-2xl font-bold">
                  {language === 'ms' ? 'Terima Kasih!' : 'Thank You!'}
                </h2>
                <p className="mb-6 text-muted-foreground">
                  {language === 'ms'
                    ? 'Maklumat temujanji anda telah direkodkan. Sila hubungi kami melalui WhatsApp untuk pengesahan.'
                    : 'Your appointment information has been recorded. Please contact us via WhatsApp for confirmation.'}
                </p>
                <Button size="lg" className="bg-whatsapp hover:bg-whatsapp/90" asChild>
                  <a
                    href={`${CLINIC_INFO.whatsapp}?text=${getWhatsAppMessage()}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 h-5 w-5" />
                    {language === 'ms' ? 'Hantar ke WhatsApp' : 'Send to WhatsApp'}
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  className="mt-4 w-full"
                  onClick={() => {
                    setIsSubmitted(false);
                    setFormData({ name: '', phone: '', service: '', date: '', time: '', message: '' });
                  }}
                >
                  {language === 'ms' ? 'Buat Temujanji Lain' : 'Make Another Appointment'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Hero */}
      <section className="bg-gradient-to-b from-background to-primary/5 py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-4">{t('cta.bookAppointment')}</h1>
            <p className="text-lg text-muted-foreground">
              {language === 'ms'
                ? 'Isi borang di bawah untuk membuat temujanji dengan kami.'
                : 'Fill in the form below to make an appointment with us.'}
            </p>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-16 md:py-24">
        <div className="container">
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Form */}
            <div className="lg:col-span-2">
              <Card className="shadow-card">
                <CardContent className="p-6 md:p-8">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="name">
                          {language === 'ms' ? 'Nama Penuh' : 'Full Name'} *
                        </Label>
                        <Input
                          id="name"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder={language === 'ms' ? 'Nama anda' : 'Your name'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">
                          {language === 'ms' ? 'No. Telefon' : 'Phone Number'} *
                        </Label>
                        <Input
                          id="phone"
                          type="tel"
                          required
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder="012-345 6789"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="service">
                        {language === 'ms' ? 'Perkhidmatan' : 'Service'} *
                      </Label>
                      <Select
                        value={formData.service}
                        onValueChange={(value) => setFormData({ ...formData, service: value })}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={language === 'ms' ? 'Pilih perkhidmatan' : 'Select a service'} />
                        </SelectTrigger>
                        <SelectContent>
                          {SERVICES.map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                              {language === 'ms' ? service.titleMs : service.titleEn}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="date">
                          {language === 'ms' ? 'Tarikh Pilihan' : 'Preferred Date'} *
                        </Label>
                        <Input
                          id="date"
                          type="date"
                          required
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="time">
                          {language === 'ms' ? 'Masa Pilihan' : 'Preferred Time'} *
                        </Label>
                        <Input
                          id="time"
                          type="time"
                          required
                          value={formData.time}
                          onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">
                        {language === 'ms' ? 'Mesej Tambahan' : 'Additional Message'}
                      </Label>
                      <Textarea
                        id="message"
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        placeholder={language === 'ms' ? 'Sebarang maklumat tambahan...' : 'Any additional information...'}
                        rows={4}
                      />
                    </div>

                    <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                      <p>
                        {language === 'ms'
                          ? '🔒 Maklumat anda dirahsiakan dan hanya untuk urusan temujanji.'
                          : '🔒 Your information is confidential and only used for appointment purposes.'}
                      </p>
                    </div>

                    <Button type="submit" size="lg" className="w-full">
                      <Calendar className="mr-2 h-5 w-5" />
                      {language === 'ms' ? 'Hantar Permohonan' : 'Submit Request'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Contact Info Sidebar */}
            <div className="space-y-6">
              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {language === 'ms' ? 'Hubungi Terus' : 'Contact Directly'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <a
                    href={CLINIC_INFO.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg bg-whatsapp/10 p-4 text-foreground transition-colors hover:bg-whatsapp/20"
                  >
                    <MessageCircle className="h-6 w-6 text-whatsapp" />
                    <div>
                      <p className="font-medium">WhatsApp</p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ms' ? 'Balas segera' : 'Quick response'}
                      </p>
                    </div>
                  </a>
                  <a
                    href={CLINIC_INFO.phoneLink}
                    className="flex items-center gap-3 rounded-lg bg-phone/10 p-4 text-foreground transition-colors hover:bg-phone/20"
                  >
                    <Phone className="h-6 w-6 text-phone" />
                    <div>
                      <p className="font-medium">{CLINIC_INFO.phone}</p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ms' ? 'Hubungi kami' : 'Call us'}
                      </p>
                    </div>
                  </a>
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle className="text-lg">{t('footer.hours')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{t('footer.everyday')}</p>
                      <p className="text-muted-foreground">
                        {language === 'ms' ? CLINIC_INFO.hours.timeMalay : CLINIC_INFO.hours.time}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {language === 'ms' ? 'Alamat' : 'Address'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                    <address className="not-italic text-muted-foreground">
                      {CLINIC_INFO.address.line1}
                      <br />
                      {CLINIC_INFO.address.line2}
                      <br />
                      {CLINIC_INFO.address.city}, {CLINIC_INFO.address.state}
                    </address>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
