import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Map, Plus, MapPin, Pencil, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { bento, bentoHeader, fieldLabel, pageInner, pageShell, primaryBtn, secondaryBtn, softInput } from '@/lib/clinic/bentoTokens';

interface GeofenceZone { id: string; name: string; description: string | null; latitude: number; longitude: number; radius_meters: number; is_active: boolean; }

export default function AdminZones() {
  const { toast } = useToast();
  const [zones, setZones] = useState<GeofenceZone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<GeofenceZone | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', latitude: '', longitude: '', radius_meters: '100', is_active: true });

  useEffect(() => { fetchZones(); }, []);

  const fetchZones = async () => { setIsLoading(true); const { data } = await supabase.from('geofence_zones').select('*').order('name'); if (data) setZones(data); setIsLoading(false); };
  const resetForm = () => { setFormData({ name: '', description: '', latitude: '', longitude: '', radius_meters: '100', is_active: true }); setEditingZone(null); };

  const openEditDialog = (zone: GeofenceZone) => {
    setEditingZone(zone);
    setFormData({ name: zone.name, description: zone.description || '', latitude: zone.latitude.toString(), longitude: zone.longitude.toString(), radius_meters: zone.radius_meters.toString(), is_active: zone.is_active });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.latitude || !formData.longitude) { toast({ title: 'Validation Error', description: 'Please fill in all required fields', variant: 'destructive' }); return; }
    setIsSaving(true);
    const zoneData = { name: formData.name, description: formData.description || null, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius_meters: parseInt(formData.radius_meters), is_active: formData.is_active };
    const { error } = editingZone ? await supabase.from('geofence_zones').update(zoneData).eq('id', editingZone.id) : await supabase.from('geofence_zones').insert(zoneData);
    if (error) toast({ title: 'Error', description: 'Failed to save zone', variant: 'destructive' });
    else { toast({ title: editingZone ? 'Zone Updated' : 'Zone Created', description: `${formData.name} has been ${editingZone ? 'updated' : 'created'}` }); setIsDialogOpen(false); resetForm(); fetchZones(); }
    setIsSaving(false);
  };

  const handleDelete = async (zone: GeofenceZone) => {
    if (!confirm(`Delete "${zone.name}"?`)) return;
    const { error } = await supabase.from('geofence_zones').delete().eq('id', zone.id);
    if (error) toast({ title: 'Error', description: 'Failed to delete zone', variant: 'destructive' });
    else { toast({ title: 'Zone Deleted' }); fetchZones(); }
  };

  const toggleActive = async (zone: GeofenceZone) => { await supabase.from('geofence_zones').update({ is_active: !zone.is_active }).eq('id', zone.id); fetchZones(); };

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Geofence Zones</h1>
            <p className="text-sm text-slate-500">Manage allowed punch locations</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild><Button className={primaryBtn}><Plus className="h-4 w-4 mr-2" />Add Zone</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-white">
              <DialogHeader><DialogTitle className="text-slate-800">{editingZone ? 'Edit Zone' : 'Add New Zone'}</DialogTitle><DialogDescription className="text-slate-500">{editingZone ? 'Update the geofence zone details' : 'Create a new geofence location for attendance'}</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label className={fieldLabel}>Zone Name *</Label><Input className={softInput} placeholder="e.g., Main Office" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                <div className="space-y-2"><Label className={fieldLabel}>Description</Label><Textarea className={softInput} placeholder="Optional description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className={fieldLabel}>Latitude *</Label><Input className={softInput} type="number" step="any" placeholder="3.8077" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} /></div>
                  <div className="space-y-2"><Label className={fieldLabel}>Longitude *</Label><Input className={softInput} type="number" step="any" placeholder="103.3260" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label className={fieldLabel}>Radius (meters)</Label><Input className={softInput} type="number" value={formData.radius_meters} onChange={(e) => setFormData({ ...formData, radius_meters: e.target.value })} /></div>
                <div className="flex items-center justify-between"><Label className={fieldLabel}>Active</Label><Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} /></div>
              </div>
              <DialogFooter><Button className={secondaryBtn} onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button className={primaryBtn} onClick={handleSubmit} disabled={isSaving}>{isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingZone ? 'Update Zone' : 'Create Zone'}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className={cn(bento, 'p-4')}>
          <h2 className={cn(bentoHeader, 'flex items-center gap-2')}><Map className="h-4 w-4" />Zone List</h2>
          <p className="text-sm text-slate-500 -mt-2 mb-4">{zones.filter(z => z.is_active).length} active zones</p>
          {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
          : zones.length === 0 ? <div className="text-center py-8 text-slate-500">No zones configured. Add your first geofence zone.</div>
          : (
            <div className="space-y-3">{zones.map((zone) => (
              <div key={zone.id} className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50', !zone.is_active && 'opacity-60')}>
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0"><MapPin className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <p className="font-medium text-slate-800">{zone.name}</p>
                    {zone.description && <p className="text-sm text-slate-600">{zone.description}</p>}
                    <p className="text-xs text-slate-500 mt-1">{zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)} • {zone.radius_meters}m radius</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={zone.is_active} onCheckedChange={() => toggleActive(zone)} />
                  <Button variant="ghost" size="icon" className="text-slate-600 hover:bg-slate-100" onClick={() => openEditDialog(zone)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-rose-600 hover:bg-rose-50" onClick={() => handleDelete(zone)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}</div>
          )}
        </div>

        <div className={cn(bento, 'p-4')}>
          <h2 className={bentoHeader}>Getting GPS Coordinates</h2>
          <div className="text-sm text-slate-600 space-y-2">
            <p>To get GPS coordinates:</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-500">
              <li>Open Google Maps on your phone at the location</li>
              <li>Long-press on the exact spot</li>
              <li>The coordinates will appear at the top</li>
              <li>Copy and paste them into the form above</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
