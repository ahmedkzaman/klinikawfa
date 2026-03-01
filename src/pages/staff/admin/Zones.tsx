import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Map, Plus, MapPin, Pencil, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Geofence Zones</h1><p className="text-muted-foreground">Manage allowed punch locations</p></div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Zone</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader><DialogTitle>{editingZone ? 'Edit Zone' : 'Add New Zone'}</DialogTitle><DialogDescription>{editingZone ? 'Update the geofence zone details' : 'Create a new geofence location for attendance'}</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Zone Name *</Label><Input placeholder="e.g., Main Office" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Description</Label><Textarea placeholder="Optional description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Latitude *</Label><Input type="number" step="any" placeholder="3.8077" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} /></div>
                <div className="space-y-2"><Label>Longitude *</Label><Input type="number" step="any" placeholder="103.3260" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Radius (meters)</Label><Input type="number" value={formData.radius_meters} onChange={(e) => setFormData({ ...formData, radius_meters: e.target.value })} /></div>
              <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={isSaving}>{isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editingZone ? 'Update Zone' : 'Create Zone'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5" />Zone List</CardTitle><CardDescription>{zones.filter(z => z.is_active).length} active zones</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : zones.length === 0 ? <div className="text-center py-8 text-muted-foreground">No zones configured. Add your first geofence zone.</div>
          : (
            <div className="space-y-4">{zones.map((zone) => (
              <div key={zone.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg ${!zone.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0"><MapPin className="h-5 w-5 text-primary" /></div>
                  <div><p className="font-medium">{zone.name}</p>{zone.description && <p className="text-sm text-muted-foreground">{zone.description}</p>}<p className="text-xs text-muted-foreground mt-1">{zone.latitude.toFixed(4)}, {zone.longitude.toFixed(4)} • {zone.radius_meters}m radius</p></div>
                </div>
                <div className="flex items-center gap-2"><Switch checked={zone.is_active} onCheckedChange={() => toggleActive(zone)} /><Button variant="ghost" size="icon" onClick={() => openEditDialog(zone)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDelete(zone)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Getting GPS Coordinates</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground space-y-2"><p>To get GPS coordinates:</p><ol className="list-decimal list-inside space-y-1"><li>Open Google Maps on your phone at the location</li><li>Long-press on the exact spot</li><li>The coordinates will appear at the top</li><li>Copy and paste them into the form above</li></ol></CardContent></Card>
    </div>
  );
}
