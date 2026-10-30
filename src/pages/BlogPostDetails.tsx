import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { getAllClientDatabases } from '../lib/firebase';
import { Loader2, Calendar, ArrowLeft, User } from 'lucide-react';
import DOMPurify from 'dompurify';

const BlogPostDetails: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const dbs = getAllClientDatabases();
        let found: any = null;
        for (const clientDb of dbs) {
          try {
            const q = query(collection(clientDb, 'blog'), where('slug', '==', slug));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              const docSnap = snapshot.docs[0];
              found = { id: docSnap.id, ...docSnap.data() };
              break;
            }
            if (slug) {
              const byId = await getDoc(doc(clientDb, 'blog', slug));
              if (byId.exists()) {
                found = { id: byId.id, ...byId.data() };
                break;
              }
            }
          } catch {
            // ignore secondary db error
          }
        }
        
        if (found) {
          setPost(found);
          setError(false);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error("Error fetching blog post:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    
    if (slug) fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center bg-brand-neutral dark:bg-slate-900">
          <Loader2 className="w-10 h-10 animate-spin text-brand-red" />
        </div>
      </MainLayout>
    );
  }

  if (error || !post) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center bg-brand-neutral dark:bg-slate-900 px-4 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-slate dark:text-white mb-4">Post Not Found</h1>
          <p className="text-base text-slate-600 dark:text-slate-400 mb-8 max-w-md">
            We couldn't find the article you were looking for. It might have been moved or removed.
          </p>
          <Link to="/blog" className="inline-flex items-center gap-2 bg-brand-slate text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors uppercase tracking-wider text-xs">
            <ArrowLeft size={16} />
            BACK TO BLOG
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <SEO 
        title={post.title} 
        description={post.excerpt || `Read ${post.title} on Jaystarbliss Studios blog.`} 
      />

      <article className="bg-brand-neutral dark:bg-slate-900 pb-24">
        {/* Hero Section */}
        {post.featuredImage ? (
          <div className="w-full h-[40vh] md:h-[55vh] relative overflow-hidden bg-brand-slate">
            <img 
              src={post.featuredImage} 
              alt={post.title} 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-transparent" />
            <div className="absolute inset-0 flex items-end">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl pb-10 sm:pb-16">
                <Link to="/blog" className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-6 transition-colors font-bold uppercase tracking-widest text-xs">
                  <ArrowLeft size={14} />
                  Back to Blog
                </Link>
                
                <div className="flex items-center gap-4 text-xs font-bold text-white/80 mb-4 uppercase tracking-wider flex-wrap">
                  {post.category && (
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      post.category.toLowerCase().includes('news')
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-brand-red text-white'
                    }`}>
                      {post.category}
                    </span>
                  )}
                  {post.createdAt && (
                    <div className="flex items-center gap-1.5 text-white/70">
                      <Calendar size={14} />
                      {new Date(post.createdAt).toLocaleDateString()}
                    </div>
                  )}
                  {post.author && (
                    <div className="flex items-center gap-1.5 text-white/70">
                      <User size={14} />
                      {post.author}
                    </div>
                  )}
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight">
                  {post.title}
                </h1>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-brand-slate text-white pt-24 pb-16 px-4">
            <div className="container mx-auto max-w-4xl">
              <Link to="/blog" className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-8 transition-colors font-bold uppercase tracking-widest text-xs">
                <ArrowLeft size={14} />
                Back to Blog
              </Link>
              <div className="flex items-center gap-4 text-xs font-bold text-white/70 mb-4 uppercase tracking-wider flex-wrap">
                {post.category && (
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    post.category.toLowerCase().includes('news')
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-brand-red text-white'
                  }`}>
                    {post.category}
                  </span>
                )}
                {post.createdAt && (
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {new Date(post.createdAt).toLocaleDateString()}
                  </div>
                )}
                {post.author && (
                  <div className="flex items-center gap-1.5">
                    <User size={14} />
                    {post.author}
                  </div>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight">
                {post.title}
              </h1>
            </div>
          </div>
        )}

        {/* Content Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl py-12 sm:py-16">
          <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-8 sm:p-12 rounded-2xl border border-white/60 dark:border-white/10 shadow-sm">
            <div className="prose prose-lg dark:prose-invert prose-headings:font-bold prose-a:text-brand-red max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
              <div className="quill-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content || '') }} />
            </div>
          </div>
        </div>
      </article>
    </MainLayout>
  );
};

export default BlogPostDetails;
