import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { MainLayout } from "@/components/layout";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <MainLayout>
      <section className="flex min-h-[70vh] items-center justify-center bg-muted px-4">
      <div className="w-full max-w-2xl text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="mt-4 inline-flex min-h-11 items-center text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
      </section>
    </MainLayout>
  );
};

export default NotFound;
