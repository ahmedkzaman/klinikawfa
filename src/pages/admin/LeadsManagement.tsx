import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Search, 
  Download, 
  Phone, 
  MessageSquare, 
  Eye,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type Appointment = Tables<'appointments'>;

const statusOptions = [
  { value: 'all', labelMs: 'Semua', labelEn: 'All' },
  { value: 'pending', labelMs: 'Menunggu', labelEn: 'Pending' },
  { value: 'contacted', labelMs: 'Dihubungi', labelEn: 'Contacted' },
  { value: 'confirmed', labelMs: 'Disahkan', labelEn: 'Confirmed' },
  { value: 'cancelled', labelMs: 'Dibatalkan', labelEn: 'Cancelled' },
];

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  contacted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function LeadsManagement() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState<Appointment | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuatkan leads.' : 'Failed to load leads.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch = 
        lead.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.patient_phone.includes(searchQuery) ||
        lead.service.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [leads, searchQuery, statusFilter]);

  const updateLeadStatus = async (id: string, newStatus: string) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setLeads(leads.map(lead => 
        lead.id === id ? { ...lead, status: newStatus } : lead
      ));
      
      if (selectedLead?.id === id) {
        setSelectedLead({ ...selectedLead, status: newStatus });
      }

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Status dikemaskini.' : 'Status updated.',
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal mengemaskini status.' : 'Failed to update status.',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Time', 'Name', 'Phone', 'Service', 'Status', 'Message'];
    const csvContent = [
      headers.join(','),
      ...filteredLeads.map(lead => [
        lead.appointment_date,
        lead.appointment_time,
        `"${lead.patient_name}"`,
        lead.patient_phone,
        `"${lead.service}"`,
        lead.status,
        `"${lead.message || ''}"`,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leads_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const openWhatsApp = (phone: string, name: string) => {
    const message = language === 'ms'
      ? `Assalamualaikum ${name}, kami dari Klinik Seri Cahaya ingin mengesahkan temujanji anda.`
      : `Hello ${name}, we are from Klinik Seri Cahaya and would like to confirm your appointment.`;
    const formattedPhone = phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/6${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const callPhone = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const getStatusLabel = (status: string) => {
    const option = statusOptions.find(o => o.value === status);
    return option ? (language === 'ms' ? option.labelMs : option.labelEn) : status;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {language === 'ms' ? 'Leads / Temujanji' : 'Leads / Appointments'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ms' 
              ? `${filteredLeads.length} leads dijumpai` 
              : `${filteredLeads.length} leads found`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchLeads} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            {language === 'ms' ? 'Eksport CSV' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={language === 'ms' ? 'Cari nama, telefon, atau perkhidmatan...' : 'Search name, phone, or service...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {language === 'ms' ? option.labelMs : option.labelEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {language === 'ms' ? 'Tiada leads dijumpai.' : 'No leads found.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ms' ? 'Tarikh' : 'Date'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Masa' : 'Time'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Nama' : 'Name'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Telefon' : 'Phone'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Perkhidmatan' : 'Service'}</TableHead>
                    <TableHead>{language === 'ms' ? 'Status' : 'Status'}</TableHead>
                    <TableHead className="text-right">{language === 'ms' ? 'Tindakan' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(lead.appointment_date), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>{lead.appointment_time}</TableCell>
                      <TableCell className="font-medium">{lead.patient_name}</TableCell>
                      <TableCell>{lead.patient_phone}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{lead.service}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[lead.status] || ''} variant="secondary">
                          {getStatusLabel(lead.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => setSelectedLead(lead)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => callPhone(lead.patient_phone)}
                          >
                            <Phone className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openWhatsApp(lead.patient_phone, lead.patient_name)}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lead Detail Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {language === 'ms' ? 'Detail Lead' : 'Lead Detail'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ms' 
                ? 'Maklumat penuh temujanji' 
                : 'Full appointment information'}
            </DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-4">
              <div className="grid gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {language === 'ms' ? 'Nama' : 'Name'}
                  </label>
                  <p className="font-medium">{selectedLead.patient_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {language === 'ms' ? 'Telefon' : 'Phone'}
                  </label>
                  <p className="font-medium">{selectedLead.patient_phone}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {language === 'ms' ? 'Perkhidmatan' : 'Service'}
                  </label>
                  <p className="font-medium">{selectedLead.service}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {language === 'ms' ? 'Tarikh' : 'Date'}
                    </label>
                    <p className="font-medium">
                      {format(new Date(selectedLead.appointment_date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {language === 'ms' ? 'Masa' : 'Time'}
                    </label>
                    <p className="font-medium">{selectedLead.appointment_time}</p>
                  </div>
                </div>
                {selectedLead.message && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      {language === 'ms' ? 'Mesej' : 'Message'}
                    </label>
                    <p className="text-sm">{selectedLead.message}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    {language === 'ms' ? 'Dihantar' : 'Submitted'}
                  </label>
                  <p className="text-sm">
                    {format(new Date(selectedLead.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>

              {/* Status Update */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {language === 'ms' ? 'Kemaskini Status' : 'Update Status'}
                </label>
                <Select 
                  value={selectedLead.status} 
                  onValueChange={(value) => updateLeadStatus(selectedLead.id, value)}
                  disabled={updating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.filter(o => o.value !== 'all').map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {language === 'ms' ? option.labelMs : option.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contact Actions */}
              <div className="flex gap-2">
                <Button 
                  className="flex-1" 
                  variant="outline"
                  onClick={() => callPhone(selectedLead.patient_phone)}
                >
                  <Phone className="mr-2 h-4 w-4" />
                  {language === 'ms' ? 'Panggil' : 'Call'}
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => openWhatsApp(selectedLead.patient_phone, selectedLead.patient_name)}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  WhatsApp
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
