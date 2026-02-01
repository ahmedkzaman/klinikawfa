import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { 
  Plus, 
  Trash2, 
  Loader2,
  RefreshCw,
  Upload,
  GripVertical,
  X,
  Image as ImageIcon
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type GalleryImage = Tables<'gallery_images'>;

export default function GalleryManagement() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    altText: '',
    tags: '',
  });

  const fetchImages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('gallery_images')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error('Error fetching images:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuatkan imej.' : 'Failed to load images.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: language === 'ms' ? 'Ralat' : 'Error',
          description: language === 'ms' ? 'Sila pilih fail imej.' : 'Please select an image file.',
          variant: 'destructive',
        });
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: language === 'ms' ? 'Ralat' : 'Error',
          description: language === 'ms' ? 'Saiz fail maksimum 5MB.' : 'Maximum file size is 5MB.',
          variant: 'destructive',
        });
        return;
      }
      setUploadForm(prev => ({ ...prev, file }));
    }
  };

  const uploadImage = async () => {
    if (!uploadForm.file) return;

    setUploading(true);
    try {
      // Generate unique filename
      const fileExt = uploadForm.file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `gallery/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('gallery')
        .upload(filePath, uploadForm.file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('gallery')
        .getPublicUrl(filePath);

      // Parse tags
      const tags = uploadForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      // Insert into database
      const { error: dbError } = await supabase
        .from('gallery_images')
        .insert({
          url: publicUrl,
          alt_text: uploadForm.altText || null,
          tags: tags.length > 0 ? tags : null,
          display_order: images.length,
        });

      if (dbError) throw dbError;

      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Imej dimuat naik.' : 'Image uploaded.',
      });

      setShowUploadDialog(false);
      setUploadForm({ file: null, altText: '', tags: '' });
      fetchImages();
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memuat naik imej.' : 'Failed to upload image.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async () => {
    if (!deleteId) return;

    const image = images.find(i => i.id === deleteId);
    if (!image) return;

    setDeleting(true);
    try {
      // Extract file path from URL
      const urlParts = image.url.split('/');
      const filePath = `gallery/${urlParts[urlParts.length - 1]}`;

      // Delete from storage
      await supabase.storage
        .from('gallery')
        .remove([filePath]);

      // Delete from database
      const { error } = await supabase
        .from('gallery_images')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      setImages(images.filter(i => i.id !== deleteId));
      toast({
        title: language === 'ms' ? 'Berjaya' : 'Success',
        description: language === 'ms' ? 'Imej dipadam.' : 'Image deleted.',
      });
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal memadam imej.' : 'Failed to delete image.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const moveImage = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= images.length) return;

    const newImages = [...images];
    [newImages[index], newImages[newIndex]] = [newImages[newIndex], newImages[index]];

    // Update display_order in database
    try {
      const updates = newImages.map((img, i) => ({
        id: img.id,
        display_order: i,
      }));

      for (const update of updates) {
        await supabase
          .from('gallery_images')
          .update({ display_order: update.display_order })
          .eq('id', update.id);
      }

      setImages(newImages);
    } catch (error) {
      console.error('Error reordering images:', error);
      toast({
        title: language === 'ms' ? 'Ralat' : 'Error',
        description: language === 'ms' ? 'Gagal menyusun semula.' : 'Failed to reorder.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {language === 'ms' ? 'Galeri' : 'Gallery'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ms' 
              ? `${images.length} imej` 
              : `${images.length} images`}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchImages} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setShowUploadDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {language === 'ms' ? 'Muat Naik' : 'Upload'}
          </Button>
        </div>
      </div>

      {/* Image Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : images.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">
              {language === 'ms' ? 'Tiada imej. Muat naik imej pertama anda.' : 'No images. Upload your first image.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <Card key={image.id} className="group relative overflow-hidden">
              <div className="aspect-square">
                <img
                  src={image.url}
                  alt={image.alt_text || ''}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveImage(index, 'up')}
                    disabled={index === 0}
                  >
                    <GripVertical className="h-4 w-4 rotate-90" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setDeleteId(image.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                {image.tags && image.tags.length > 0 && (
                  <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                    {image.tags.slice(0, 3).map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'ms' ? 'Muat Naik Imej' : 'Upload Image'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ms' 
                ? 'Pilih imej untuk dimuat naik ke galeri.'
                : 'Select an image to upload to the gallery.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{language === 'ms' ? 'Imej' : 'Image'} *</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="flex-1"
                />
              </div>
              {uploadForm.file && (
                <p className="text-sm text-muted-foreground">
                  {uploadForm.file.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="altText">
                {language === 'ms' ? 'Teks Alt' : 'Alt Text'}
              </Label>
              <Input
                id="altText"
                value={uploadForm.altText}
                onChange={(e) => setUploadForm(prev => ({ ...prev, altText: e.target.value }))}
                placeholder={language === 'ms' ? 'Keterangan imej...' : 'Image description...'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">
                {language === 'ms' ? 'Tag (dipisahkan koma)' : 'Tags (comma separated)'}
              </Label>
              <Input
                id="tags"
                value={uploadForm.tags}
                onChange={(e) => setUploadForm(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="clinic, equipment, staff"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)} disabled={uploading}>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </Button>
            <Button onClick={uploadImage} disabled={!uploadForm.file || uploading}>
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Upload className="mr-2 h-4 w-4" />
              {language === 'ms' ? 'Muat Naik' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ms' ? 'Padam Imej?' : 'Delete Image?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ms' 
                ? 'Tindakan ini tidak boleh dibatalkan. Imej akan dipadam secara kekal.'
                : 'This action cannot be undone. The image will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {language === 'ms' ? 'Batal' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteImage} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'ms' ? 'Padam' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
