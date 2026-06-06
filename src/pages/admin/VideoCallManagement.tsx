import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

import { supabase } from '@/integrations/supabase/client';
import { 
  Video, 
  Plus, 
  Copy, 
  Phone, 
  PhoneOff, 
  Loader2, 
  RefreshCw,
  Users,
  Clock,
  DollarSign,
  Link,
  MoreVertical,
  XCircle,
  Trash2,
  Eye
} from 'lucide-react';
import { format } from 'date-fns';

interface VideoRoom {
  id: string;
  room_code: string;
  patient_name: string;
  patient_phone: string;
  patient_email: string | null;
  status: string;
  deposit_amount: number;
  per_minute_rate: number;
  call_started_at: string | null;
  call_ended_at: string | null;
  total_duration_seconds: number | null;
  total_amount: number | null;
  notes: string | null;
  created_at: string;
  video_payments: Array<{
    id: string;
    payment_type: string;
    amount: number;
    status: string;
  }>;
}

export default function VideoCallManagement() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<VideoRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [newRoom, setNewRoom] = useState({
    patient_name: '',
    patient_phone: '',
    patient_email: '',
    notes: '',
  });

  // Confirmation dialogs state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<VideoRoom | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchRooms = async () => {
    setIsLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast({
          title: 'Error',
          description: 'Please login first',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=list`,
        {
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();
      if (result.rooms) {
        setRooms(result.rooms);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      toast({
        title: 'Error',
        description: 'Failed to load video rooms',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const createRoom = async () => {
    if (!newRoom.patient_name || !newRoom.patient_phone) {
      toast({
        title: 'Error',
        description: 'Name and phone required',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=create`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newRoom),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create room');
      }

      toast({
        title: 'Success!',
        description: `Room created: ${result.room.room_code}`,
      });

      setShowCreateDialog(false);
      setNewRoom({ patient_name: '', patient_phone: '', patient_email: '', notes: '' });
      fetchRooms();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create room',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const createTestRoom = async () => {
    if (!newRoom.patient_name || !newRoom.patient_phone) {
      toast({
        title: 'Error',
        description: 'Name and phone required',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingTest(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=create-test`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newRoom),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create test room');
      }

      toast({
        title: 'Success!',
        description: `Test room created: ${result.room.room_code}`,
      });

      setShowTestDialog(false);
      setNewRoom({ patient_name: '', patient_phone: '', patient_email: '', notes: '' });
      fetchRooms();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create test room',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingTest(false);
    }
  };

  const cancelRoom = async (room: VideoRoom) => {
    setIsProcessing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=update-status`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            room_id: room.id, 
            status: 'cancelled' 
          }),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel room');
      }

      toast({
        title: 'Room Cancelled',
        description: `Room for ${room.patient_name} has been cancelled`,
      });

      fetchRooms();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to cancel room',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setCancelDialogOpen(false);
      setSelectedRoom(null);
    }
  };

  const deleteRoom = async (room: VideoRoom) => {
    setIsProcessing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-room?action=delete`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ room_id: room.id }),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete room');
      }

      toast({
        title: 'Room Deleted',
        description: `Room for ${room.patient_name} has been deleted`,
      });

      fetchRooms();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete room',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setDeleteDialogOpen(false);
      setSelectedRoom(null);
    }
  };

  const copyRoomCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Copied!',
      description: `Room code ${code} copied to clipboard`,
    });
  };

  const copyPatientLink = (code: string) => {
    const baseUrl = window.location.origin;
    const patientUrl = `${baseUrl}/video-call?room=${code}`;
    navigator.clipboard.writeText(patientUrl);
    toast({
      title: 'Link Copied!',
      description: 'Patient video call link copied to clipboard',
    });
  };

  const startCall = (roomCode: string) => {
    // Open in new tab for staff to join
    window.open(`/video-call/staff?room=${roomCode}`, '_blank');
  };

  const openCancelDialog = (room: VideoRoom) => {
    setSelectedRoom(room);
    setCancelDialogOpen(true);
  };

  const openDeleteDialog = (room: VideoRoom) => {
    setSelectedRoom(room);
    setDeleteDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      paid: 'secondary',
      test: 'secondary',
      active: 'default',
      ended: 'destructive',
      cancelled: 'destructive',
    };

    const labels: Record<string, string> = {
      pending: 'Pending',
      paid: 'Paid',
      test: 'Test',
      active: 'Active',
      ended: 'Ended',
      cancelled: 'Cancelled',
    };

    return (
      <Badge variant={variants[status] || 'outline'}>
        {labels[status] || status}
      </Badge>
    );
  };

  const formatCurrency = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

  const stats = {
    total: rooms.length,
    pending: rooms.filter(r => r.status === 'pending').length,
    active: rooms.filter(r => r.status === 'active').length,
    completed: rooms.filter(r => r.status === 'ended').length,
    revenue: rooms
      .filter(r => r.status === 'ended')
      .reduce((sum, r) => sum + (r.total_amount || 0), 0),
  };

  const renderActions = (room: VideoRoom) => {
    const canStart = room.status === 'paid' || room.status === 'active' || room.status === 'test';
    const canCancel = room.status === 'pending' || room.status === 'paid';
    const canDelete = room.status === 'cancelled' || room.status === 'ended';
    const isEnded = room.status === 'ended';

    return (
      <div className="flex items-center justify-end gap-2">
        {canStart && (
          <Button
            size="sm"
            onClick={() => startCall(room.room_code)}
          >
            <Phone className="h-4 w-4 mr-1" />
            {'Start'}
          </Button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover">
            {/* Copy Link - available for pending, paid, active, test */}
            {(room.status === 'pending' || room.status === 'paid' || room.status === 'active' || room.status === 'test') && (
              <DropdownMenuItem onClick={() => copyPatientLink(room.room_code)}>
                <Link className="h-4 w-4 mr-2" />
                {'Copy Link'}
              </DropdownMenuItem>
            )}

            {/* View Details - for ended rooms */}
            {isEnded && (
              <DropdownMenuItem onClick={() => copyRoomCode(room.room_code)}>
                <Eye className="h-4 w-4 mr-2" />
                {'View Details'}
              </DropdownMenuItem>
            )}

            {/* Cancel Room - for pending/paid */}
            {canCancel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => openCancelDialog(room)}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {'Cancel Room'}
                </DropdownMenuItem>
              </>
            )}

            {/* Delete Room - for cancelled/ended */}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => openDeleteDialog(room)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {'Delete Room'}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {'Cancel Video Room?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`Are you sure you want to cancel the room for "${selectedRoom?.patient_name}"? This action cannot be undone. The patient will not be able to join.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>
              {'Keep Room'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedRoom && cancelRoom(selectedRoom)}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {'Cancel Room'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {'Delete Video Room?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`Are you sure you want to delete the room for "${selectedRoom?.patient_name}"? All related records and payment data will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>
              {'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedRoom && deleteRoom(selectedRoom)}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {'Delete Room'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {'Video Calls'}
          </h1>
          <p className="text-muted-foreground">
            {'Manage video consultation sessions'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchRooms} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {'Refresh'}
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {'New Room'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {'Create Video Room'}
                </DialogTitle>
                <DialogDescription>
                  {'Create a video room for a patient. Room code will be generated automatically.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="patient_name">
                    {'Patient Name'} *
                  </Label>
                  <Input
                    id="patient_name"
                    value={newRoom.patient_name}
                    onChange={(e) => setNewRoom({ ...newRoom, patient_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patient_phone">
                    {'Phone'} *
                  </Label>
                  <Input
                    id="patient_phone"
                    value={newRoom.patient_phone}
                    onChange={(e) => setNewRoom({ ...newRoom, patient_phone: e.target.value })}
                    placeholder="+60123456789"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patient_email">
                    {'Email (Optional)'}
                  </Label>
                  <Input
                    id="patient_email"
                    type="email"
                    value={newRoom.patient_email}
                    onChange={(e) => setNewRoom({ ...newRoom, patient_email: e.target.value })}
                    placeholder="patient@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">
                    {'Notes (Optional)'}
                  </Label>
                  <Textarea
                    id="notes"
                    value={newRoom.notes}
                    onChange={(e) => setNewRoom({ ...newRoom, notes: e.target.value })}
                    placeholder={'Additional notes...'}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  {'Cancel'}
                </Button>
                <Button onClick={createRoom} disabled={isCreating}>
                  {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          {/* Test Room Dialog */}
          <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <Video className="h-4 w-4 mr-2" />
                {'Teleconsultation Test'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {'Teleconsultation Test'}
                </DialogTitle>
                <DialogDescription>
                  {'Create a test room without Stripe payment. For testing purposes only.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="test_patient_name">
                    {'Patient Name'} *
                  </Label>
                  <Input
                    id="test_patient_name"
                    value={newRoom.patient_name}
                    onChange={(e) => setNewRoom({ ...newRoom, patient_name: e.target.value })}
                    placeholder="Test Patient"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test_patient_phone">
                    {'Phone'} *
                  </Label>
                  <Input
                    id="test_patient_phone"
                    value={newRoom.patient_phone}
                    onChange={(e) => setNewRoom({ ...newRoom, patient_phone: e.target.value })}
                    placeholder="+60123456789"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test_notes">
                    {'Notes (Optional)'}
                  </Label>
                  <Textarea
                    id="test_notes"
                    value={newRoom.notes}
                    onChange={(e) => setNewRoom({ ...newRoom, notes: e.target.value })}
                    placeholder={'Additional notes...'}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                  {'Cancel'}
                </Button>
                <Button onClick={createTestRoom} disabled={isCreatingTest} variant="secondary">
                  {isCreatingTest && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {'Create Test'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {'Total Rooms'}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {'Pending Payment'}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {'Active Calls'}
            </CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {'Total Revenue'}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.revenue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Rooms Table */}
      <Card>
        <CardHeader>
          <CardTitle>{'Room List'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {'No video rooms. Create a new room to get started.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{'Room Code'}</TableHead>
                  <TableHead>{'Patient'}</TableHead>
                  <TableHead>{'Status'}</TableHead>
                  <TableHead>{'Duration'}</TableHead>
                  <TableHead>{'Amount'}</TableHead>
                  <TableHead>{'Created'}</TableHead>
                  <TableHead className="text-right">{'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-lg font-bold">{room.room_code}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyPatientLink(room.room_code)}
                          title={'Copy Link'}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{room.patient_name}</div>
                        <div className="text-sm text-muted-foreground">{room.patient_phone}</div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(room.status)}</TableCell>
                    <TableCell>
                      {room.total_duration_seconds 
                        ? `${Math.ceil(room.total_duration_seconds / 60)} min`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {room.total_amount 
                        ? formatCurrency(room.total_amount)
                        : formatCurrency(room.deposit_amount)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(room.created_at), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="text-right">
                      {renderActions(room)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
