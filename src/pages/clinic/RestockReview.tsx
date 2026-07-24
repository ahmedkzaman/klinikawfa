import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Inbox, PackageCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCloseRestockRequest,
  useOutOfStockRestockRequestFrequency,
  useRestockRequests,
} from '@/hooks/clinic/useRestockRequests';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';

type RestockRow = {
  id: string;
  inventory_item_id: string;
  requested_by: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  inventory_items?: { name: string; stock: number | null } | null;
  requester?: { full_name: string | null; email: string | null } | null;
};

type FrequencyRow = {
  month: string;
  month_label: string;
  inventory_item_id: string;
  item_name: string;
  request_count: number;
};

export default function RestockReview() {
  const { isStaffOrAdmin, isLocum, rolesLoading } = useAuth();
  const allowed = isStaffOrAdmin && !isLocum;
  const [tab, setTab] = useState<'open' | 'frequency'>('open');

  const { data: rawRequests = [], isLoading } = useRestockRequests('open');
  const requests = rawRequests as unknown as RestockRow[];
  const { data: frequencyRows = [], isLoading: isFrequencyLoading } =
    useOutOfStockRestockRequestFrequency();
  const frequency = frequencyRows as unknown as FrequencyRow[];

  const closeRequest = useCloseRestockRequest();
  const [pendingClose, setPendingClose] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...requests].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [requests],
  );

  if (rolesLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You dont have permission to view restock requests.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="rounded-xl">
            <Link to="/clinic/inventory">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Inventory
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Restock Requests</h1>
          <Badge variant="secondary" className="text-xs">
            {sorted.length} open
          </Badge>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as 'open' | 'frequency')}>
        <TabsList>
          <TabsTrigger value="open">Open Requests</TabsTrigger>
          <TabsTrigger value="frequency">Out-of-Stock Frequency</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open queue</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-sm text-muted-foreground">Loading...</div>
              ) : sorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Inbox className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">No open restock requests</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pharmacy is caught up. New doctor requests will appear here.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">Date Requested</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-32">Stock</TableHead>
                      <TableHead className="w-48">Requested By</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="w-44 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r) => {
                      const requester =
                        r.requester?.full_name?.trim() ||
                        r.requester?.email ||
                        '-';
                      const stock = r.inventory_items?.stock ?? null;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">
                            <span title={new Date(r.created_at).toLocaleString()}>
                              {formatDistanceToNow(new Date(r.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {r.inventory_items?.name ?? 'Unknown item'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {stock === null ? (
                              '-'
                            ) : stock === 0 ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Out
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100 border-transparent">
                                {stock} left
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{requester}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.reason || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <AlertDialog
                              open={pendingClose === r.id}
                              onOpenChange={(o) => setPendingClose(o ? r.id : null)}
                            >
                              <AlertDialogTrigger asChild>
                                <Button size="sm" className="h-8">
                                  <PackageCheck className="h-3.5 w-3.5 mr-1" />
                                  Mark as Ordered
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Mark as ordered?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This closes the restock request for{' '}
                                    <span className="font-medium">
                                      {r.inventory_items?.name}
                                    </span>
                                    . Use this once the supplier order has been placed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => {
                                      closeRequest.mutate(r.id, {
                                        onSettled: () => setPendingClose(null),
                                      });
                                    }}
                                  >
                                    Confirm
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="frequency" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Monthly out-of-stock frequency</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isFrequencyLoading ? (
                <div className="p-8 text-sm text-muted-foreground">Loading...</div>
              ) : frequency.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Inbox className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">No out-of-stock request frequency found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    We will start tracking requests with items currently out of stock.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">Month</TableHead>
                      <TableHead>Medicine</TableHead>
                      <TableHead className="w-40 text-right">Requests</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {frequency.map((entry) => {
                      const rowKey = `${entry.month}-${entry.inventory_item_id}`;
                      return (
                        <TableRow key={rowKey}>
                          <TableCell className="text-sm">{entry.month_label}</TableCell>
                          <TableCell className="text-sm font-medium">
                            {entry.item_name}
                          </TableCell>
                          <TableCell className="text-sm text-right">
                            <Badge variant="secondary" className="text-[11px]">
                              {entry.request_count}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
