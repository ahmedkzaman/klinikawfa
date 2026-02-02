import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Running publish-scheduled-posts cron job...');
    
    // Create Supabase client with service role for admin operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date().toISOString();

    // Find posts that are scheduled and their scheduled time has passed
    // These posts have published = true, scheduled_at is set, and scheduled_at <= now
    const { data: scheduledPosts, error: fetchError } = await supabase
      .from('blog_posts')
      .select('id, title, scheduled_at')
      .eq('published', true)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now);

    if (fetchError) {
      console.error('Error fetching scheduled posts:', fetchError);
      throw fetchError;
    }

    if (!scheduledPosts || scheduledPosts.length === 0) {
      console.log('No scheduled posts to publish at this time.');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No scheduled posts to publish',
          published_count: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${scheduledPosts.length} posts to publish:`, scheduledPosts.map(p => p.title));

    // Clear scheduled_at to mark them as permanently published
    const postIds = scheduledPosts.map(p => p.id);
    const { error: updateError } = await supabase
      .from('blog_posts')
      .update({ scheduled_at: null })
      .in('id', postIds);

    if (updateError) {
      console.error('Error updating posts:', updateError);
      throw updateError;
    }

    console.log(`Successfully published ${scheduledPosts.length} scheduled posts.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Published ${scheduledPosts.length} scheduled posts`,
        published_count: scheduledPosts.length,
        published_posts: scheduledPosts.map(p => ({ id: p.id, title: p.title }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in publish-scheduled-posts:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
