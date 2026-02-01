import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLINIC_INFO, SERVICES } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { appointmentSchema, AppointmentFormData } from '@/lib/validations';
import { supabase } from '@/integrations/supabase/client';
import { 
  Calendar, 
  Clock, 
  Phone, 
  MessageCircle, 
  User, 
  Stethoscope, 
  MapPin,
  CheckCircle,
  Loader2,
  Shield
} from 'lucide-react';

export default function Appointment() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedData, setSubmittedData] = useState<AppointmentFormData | null>(null);

  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      name: '',
      phone: '',
      preferred_date: '',
      preferred_time: '',
      service: '',
      message: '',
      pdpaConsent: false,
    },
  });

  const generateTimeSlots = () => {
    const slots: string[] = [];
    // Clinic hours: 8:00 AM to 12:00 Midnight
    for (let hour = 8; hour < 24; hour++) {
      const time24 = `${hour.toString().padStart(2, '0')}:00`;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const time12 = `${hour12}:00 ${ampm}`;
      slots.push(`${time24}|${time12}`);
    }
    return slots;
  };

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const handleSubmit = async (data: AppointmentFormData) => {
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from('appointments').insert({
        name: data.name.trim(),
        phone: data.phone.trim(),
        preferred_date: data.preferred_date,
        preferred_time: data.preferred_time,
        service: data.service,
        message: data.message?.trim() || null,
        status: 'pending',
      });

      if (error) {
        throw error;
      }

      setSubmittedData(data);
      setIsSuccess(true);
      form.reset();

      toast({
        title: language === 'ms' ? 'Berjaya!' : 'Success!',
        description: language === 'ms' 
          ? 'Permintaan temujanji anda telah dihantar.'
          : 'Your appointment request has been submitted.',
      });
    } catch (error) {
      console.error('Appointment submission error:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms'
          ? 'Gagal menghantar permintaan. Sila cuba lagi.'
          : 'Failed to submit request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateWhatsAppMessage = (data: AppointmentFormData) => {
    const service = SERVICES.find(s => s.id === data.service);
    const serviceName = language === 'ms' ? service?.titleMs : service?.titleEn;
    
    const message = language === 'ms'
      ? `Assalamualaikum, saya ingin membuat temujanji:
      
Nama: ${data.name}
No. Telefon: ${data.phone}
Tarikh Pilihan: ${data.preferred_date}
Masa Pilihan: ${data.preferred_time}
Perkhidmatan: ${serviceName}
${data.message ? `Catatan: ${data.message}` : ''}

Terima kasih.`
      : `Hello, I would like to make an appointment:

Name: ${data.name}
Phone: ${data.phone}
Preferred Date: ${data.preferred_date}
Preferred Time: ${data.preferred_time}
Service: ${serviceName}
${data.message ? `Notes: ${data.message}` : ''}

Thank you.`;

    return encodeURIComponent(message);
  };

  const handleWhatsAppClick = () => {
    if (!submittedData) return;
    
    const message = generateWhatsAppMessage(submittedData);
    const whatsappUrl = `https://wa.me/60182523531?text=${message}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <MainLayout>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/10 via-background to-background py-16 md:py-20">
        <div className="container relative">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Calendar className="h-4 w-4" />
              {t('cta.bookAppointment')}
            </div>
            <h1 className="mb-4">
              {language === 'ms' ? 'Tempah Temujanji Anda' : 'Book Your Appointment'}
            </h1>
            <p className="text-lg text-muted-foreground">
              {language === 'ms'
                ? 'Isi borang di bawah atau hubungi kami terus melalui WhatsApp.'
                : 'Fill in the form below or contact us directly via WhatsApp.'}
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-12 md:py-16">
        <div className="container">
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Appointment Form */}
            <div className="lg:col-span-2">
              <Card className="border-border/50 shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-primary" />
                    {language === 'ms' ? 'Borang Temujanji' : 'Appointment Form'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isSuccess ? (
                    <div className="py-8 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-success">
                        <CheckCircle className="h-8 w-8" />
                      </div>
                      <h3 className="mb-2 text-xl font-semibold">
                        {language === 'ms' ? 'Terima Kasih!' : 'Thank You!'}
                      </h3>
                      <p className="mb-6 text-muted-foreground">
                        {language === 'ms'
                          ? 'Permintaan temujanji anda telah diterima. Kami akan menghubungi anda untuk pengesahan.'
                          : 'Your appointment request has been received. We will contact you for confirmation.'}
                      </p>
                      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                        <Button
                          onClick={handleWhatsAppClick}
                          className="min-w-[200px] bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90"
                        >
                          <MessageCircle className="mr-2 h-5 w-5" />
                          {language === 'ms' ? 'Hantar ke WhatsApp' : 'Send to WhatsApp'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsSuccess(false);
                            setSubmittedData(null);
                          }}
                        >
                          {language === 'ms' ? 'Buat Lagi' : 'Make Another'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                        <div className="grid gap-6 sm:grid-cols-2">
                          {/* Name */}
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{language === 'ms' ? 'Nama Penuh' : 'Full Name'} *</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                      {...field}
                                      placeholder={language === 'ms' ? 'Nama anda' : 'Your name'}
                                      className="pl-10"
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Phone */}
                          <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{language === 'ms' ? 'No. Telefon' : 'Phone Number'} *</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                      {...field}
                                      type="tel"
                                      placeholder="012-345 6789"
                                      className="pl-10"
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Date */}
                          <FormField
                            control={form.control}
                            name="preferred_date"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{language === 'ms' ? 'Tarikh Pilihan' : 'Preferred Date'} *</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                      {...field}
                                      type="date"
                                      min={getMinDate()}
                                      className="pl-10"
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Time */}
                          <FormField
                            control={form.control}
                            name="preferred_time"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{language === 'ms' ? 'Masa Pilihan' : 'Preferred Time'} *</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="pl-10">
                                      <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                      <SelectValue placeholder={language === 'ms' ? 'Pilih masa' : 'Select time'} />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {generateTimeSlots().map((slot) => {
                                      const [value, label] = slot.split('|');
                                      return (
                                        <SelectItem key={value} value={value}>
                                          {label}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Service */}
                        <FormField
                          control={form.control}
                          name="service"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{language === 'ms' ? 'Perkhidmatan' : 'Service'} *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={language === 'ms' ? 'Pilih perkhidmatan' : 'Select service'} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {SERVICES.map((service) => (
                                    <SelectItem key={service.id} value={service.id}>
                                      {language === 'ms' ? service.titleMs : service.titleEn}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Message */}
                        <FormField
                          control={form.control}
                          name="message"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{language === 'ms' ? 'Catatan (Pilihan)' : 'Notes (Optional)'}</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder={language === 'ms' 
                                    ? 'Maklumat tambahan atau simptom yang dialami...'
                                    : 'Additional information or symptoms...'}
                                  rows={4}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* PDPA Consent */}
                        <FormField
                          control={form.control}
                          name="pdpaConsent"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border border-border/50 bg-muted/30 p-4">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="cursor-pointer">
                                  <div className="flex items-start gap-2">
                                    <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                                    <span className="text-sm">
                                      {language === 'ms'
                                        ? 'Saya bersetuju dengan pengumpulan dan penggunaan maklumat peribadi saya mengikut Akta Perlindungan Data Peribadi 2010 (PDPA) untuk tujuan temujanji dan rawatan perubatan.'
                                        : 'I consent to the collection and use of my personal information in accordance with the Personal Data Protection Act 2010 (PDPA) for appointment and medical treatment purposes.'}
                                    </span>
                                  </div>
                                </FormLabel>
                                <FormMessage />
                              </div>
                            </FormItem>
                          )}
                        />

                        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          <Calendar className="mr-2 h-5 w-5" />
                          {language === 'ms' ? 'Hantar Permintaan Temujanji' : 'Submit Appointment Request'}
                        </Button>
                      </form>
                    </Form>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Contact */}
              <Card className="border-border/50 bg-primary text-primary-foreground shadow-card">
                <CardContent className="p-6">
                  <h3 className="mb-4 text-lg font-semibold">
                    {language === 'ms' ? 'Hubungi Terus' : 'Contact Directly'}
                  </h3>
                  <div className="space-y-4">
                    <Button
                      className="w-full bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90"
                      asChild
                    >
                      <a href={CLINIC_INFO.whatsapp} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="mr-2 h-5 w-5" />
                        WhatsApp
                      </a>
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full"
                      asChild
                    >
                      <a href={CLINIC_INFO.phoneLink}>
                        <Phone className="mr-2 h-5 w-5" />
                        {CLINIC_INFO.phone}
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Clinic Hours */}
              <Card className="border-border/50 shadow-soft">
                <CardContent className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <Clock className="h-5 w-5 text-primary" />
                    {t('footer.hours')}
                  </h3>
                  <div className="space-y-2">
                    <p className="font-medium">{t('footer.everyday')}</p>
                    <p className="text-2xl font-bold text-primary">
                      {language === 'ms' ? CLINIC_INFO.hours.timeMalay : CLINIC_INFO.hours.time}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Address */}
              <Card className="border-border/50 shadow-soft">
                <CardContent className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <MapPin className="h-5 w-5 text-primary" />
                    {language === 'ms' ? 'Alamat' : 'Address'}
                  </h3>
                  <address className="not-italic text-muted-foreground">
                    <p>{CLINIC_INFO.address.line1}</p>
                    <p>{CLINIC_INFO.address.line2}</p>
                    <p>{CLINIC_INFO.address.city}</p>
                    <p>{CLINIC_INFO.address.state}</p>
                  </address>
                  <Button
                    variant="outline"
                    className="mt-4 w-full"
                    asChild
                  >
                    <a href={CLINIC_INFO.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                      <MapPin className="mr-2 h-4 w-4" />
                      {t('cta.getDirections')}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
