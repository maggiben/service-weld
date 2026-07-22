"use client";

import Box from "@mui/material/Box";
import { AboutSection } from "./sections/AboutSection";
import { ContactSection } from "./sections/ContactSection";
import { HeroSection } from "./sections/HeroSection";
import { LandingFooter } from "./sections/LandingFooter";
import { LandingHeader } from "./sections/LandingHeader";
import { MapSection } from "./sections/MapSection";
import { ServicesSection } from "./sections/ServicesSection";
import { TestimonialsSection } from "./sections/TestimonialsSection";
import { WhyUsSection } from "./sections/WhyUsSection";

export default function LandingPage() {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <LandingHeader />
      <Box component="main" id="main">
        <HeroSection />
        <AboutSection />
        <ServicesSection />
        <WhyUsSection />
        <TestimonialsSection />
        <ContactSection />
        <MapSection />
      </Box>
      <LandingFooter />
    </Box>
  );
}
