import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReviews, useCreateReview, useUpdateReview, useDeleteReview, Review, ReviewInsert } from '@/hooks/useReviews';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StarRating } from '@/components/ui/star-rating';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, RefreshCw, Quote } from 'lucide-react';
import { toast } from 'sonner';

const emptyReview: ReviewInsert = {
  name_ms: '',
  name_en: '',
  text_ms: '',
  text_en: '',
  rating: 5,
  published: true,
  display_order: 0,
};

export default function ReviewsManagement() {
  const { language } = useLanguage();
  const { data: reviews, isLoading, refetch } = useReviews(false);
  const createReview = useCreateReview();
  const updateReview = useUpdateReview();
  const deleteReview = useDeleteReview();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [formData, setFormData] = useState<ReviewInsert>(emptyReview);
  const [reviewToDelete, setReviewToDelete] = useState<Review | null>(null);

  const handleAdd = () => {
    setEditingReview(null);
    setFormData({
      ...emptyReview,
      display_order: (reviews?.length || 0) + 1,
    });
    setDialogOpen(true);
  };

  const handleEdit = (review: Review) => {
    setEditingReview(review);
    setFormData({
      name_ms: review.name_ms,
      name_en: review.name_en || '',
      text_ms: review.text_ms,
      text_en: review.text_en || '',
      rating: review.rating,
      published: review.published,
      display_order: review.display_order,
    });
    setDialogOpen(true);
  };

  const handleDelete = (review: Review) => {
    setReviewToDelete(review);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!reviewToDelete) return;
    try {
      await deleteReview.mutateAsync(reviewToDelete.id);
      toast.success(language === 'ms' ? 'Ulasan dipadam' : 'Review deleted');
    } catch (error) {
      toast.error(language === 'ms' ? 'Gagal memadam ulasan' : 'Failed to delete review');
    }
    setDeleteDialogOpen(false);
    setReviewToDelete(null);
  };

  const handleSave = async () => {
    if (!formData.name_ms.trim() || !formData.text_ms.trim()) {
      toast.error(language === 'ms' ? 'Sila isi nama dan ulasan (BM)' : 'Please fill in name and review text (Malay)');
      return;
    }

    try {
      if (editingReview) {
        await updateReview.mutateAsync({ id: editingReview.id, ...formData });
        toast.success(language === 'ms' ? 'Ulasan dikemaskini' : 'Review updated');
      } else {
        await createReview.mutateAsync(formData);
        toast.success(language === 'ms' ? 'Ulasan ditambah' : 'Review added');
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(language === 'ms' ? 'Gagal menyimpan ulasan' : 'Failed to save review');
    }
  };

  const togglePublished = async (review: Review) => {
    try {
      await updateReview.mutateAsync({ id: review.id, published: !review.published });
      toast.success(
        review.published
          ? (language === 'ms' ? 'Ulasan disembunyikan' : 'Review hidden')
          : (language === 'ms' ? 'Ulasan diterbitkan' : 'Review published')
      );
    } catch (error) {
      toast.error(language === 'ms' ? 'Gagal mengemaskini ulasan' : 'Failed to update review');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {language === 'ms' ? 'Pengurusan Ulasan' : 'Reviews Management'}
          </h1>
          <p className="text-muted-foreground">
            {reviews?.length || 0} {language === 'ms' ? 'ulasan' : 'reviews'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="mr-2 h-4 w-4" />
            {language === 'ms' ? 'Tambah Ulasan' : 'Add Review'}
          </Button>
        </div>
      </div>

      {/* Reviews Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : reviews?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Quote className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {language === 'ms' ? 'Tiada ulasan lagi.' : 'No reviews yet.'}
            </p>
            <Button className="mt-4" onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              {language === 'ms' ? 'Tambah Ulasan Pertama' : 'Add First Review'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews?.map((review) => (
            <Card key={review.id} className="relative">
              <CardContent className="p-4">
                {/* Rating */}
                <div className="mb-2">
                  <StarRating value={review.rating} readonly size="sm" />
                </div>

                {/* Review Text */}
                <Quote className="mb-2 h-5 w-5 text-primary/30" />
                <p className="mb-3 line-clamp-3 text-sm text-muted-foreground">
                  "{language === 'ms' ? review.text_ms : (review.text_en || review.text_ms)}"
                </p>

                {/* Name */}
                <p className="font-medium">
                  {language === 'ms' ? review.name_ms : (review.name_en || review.name_ms)}
                </p>

                {/* Status Badge */}
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant={review.published ? 'default' : 'secondary'}>
                    {review.published
                      ? (language === 'ms' ? 'Diterbitkan' : 'Published')
                      : (language === 'ms' ? 'Draf' : 'Draft')}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => togglePublished(review)}
                      title={review.published ? 'Hide' : 'Publish'}
                    >
                      <Switch
                        checked={review.published}
                        className="pointer-events-none"
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(review)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(review)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingReview
                ? (language === 'ms' ? 'Edit Ulasan' : 'Edit Review')
                : (language === 'ms' ? 'Tambah Ulasan' : 'Add Review')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Star Rating */}
            <div className="space-y-2">
              <Label>{language === 'ms' ? 'Penilaian Bintang' : 'Star Rating'} *</Label>
              <StarRating
                value={formData.rating}
                onChange={(rating) => setFormData({ ...formData, rating })}
                size="lg"
              />
            </div>

            {/* Name Malay */}
            <div className="space-y-2">
              <Label>{language === 'ms' ? 'Nama Pengulas (BM)' : 'Reviewer Name (Malay)'} *</Label>
              <Input
                value={formData.name_ms}
                onChange={(e) => setFormData({ ...formData, name_ms: e.target.value })}
                placeholder="Puan Fatimah"
              />
            </div>

            {/* Name English */}
            <div className="space-y-2">
              <Label>{language === 'ms' ? 'Nama Pengulas (EN)' : 'Reviewer Name (English)'}</Label>
              <Input
                value={formData.name_en || ''}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                placeholder="Mrs. Fatimah"
              />
            </div>

            {/* Text Malay */}
            <div className="space-y-2">
              <Label>{language === 'ms' ? 'Ulasan (BM)' : 'Review Text (Malay)'} *</Label>
              <Textarea
                value={formData.text_ms}
                onChange={(e) => setFormData({ ...formData, text_ms: e.target.value })}
                placeholder="Doktor sangat mesra dan sabar..."
                rows={3}
              />
            </div>

            {/* Text English */}
            <div className="space-y-2">
              <Label>{language === 'ms' ? 'Ulasan (EN)' : 'Review Text (English)'}</Label>
              <Textarea
                value={formData.text_en || ''}
                onChange={(e) => setFormData({ ...formData, text_en: e.target.value })}
                placeholder="The doctor is very friendly and patient..."
                rows={3}
              />
            </div>

            {/* Published Toggle */}
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.published}
                onCheckedChange={(published) => setFormData({ ...formData, published })}
              />
              <Label>{language === 'ms' ? 'Terbitkan ulasan ini' : 'Publish this review'}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={createReview.isPending || updateReview.isPending}
            >
              {(createReview.isPending || updateReview.isPending)
                ? (language === 'ms' ? 'Menyimpan...' : 'Saving...')
                : (language === 'ms' ? 'Simpan Ulasan' : 'Save Review')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ms' ? 'Padam Ulasan?' : 'Delete Review?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ms'
                ? 'Tindakan ini tidak boleh dibatalkan. Ulasan ini akan dipadam secara kekal.'
                : 'This action cannot be undone. This review will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {language === 'ms' ? 'Padam' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
