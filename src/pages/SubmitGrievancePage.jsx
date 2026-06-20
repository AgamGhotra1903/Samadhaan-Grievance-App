// 🌐 React Core
import React, { useState } from "react";
import { motion } from "framer-motion";

import { useAuth } from "../context/AuthContext";
import { createGrievance } from "../services/api";
import { analyzeGrievanceWithAI } from "../services/gemini";
import { Button, Input, Textarea, Modal } from "../components/ui";
import MapPicker from "../components/MapPicker";

function SubmitGrievancePage({ onGrievanceSubmitted }) {
  const { user, token, isAuthenticated } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ show: false, title: "", message: "", type: "info" });
  const [showMapModal, setShowMapModal] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setModal({ show: true, title: "Error", message: "You must be logged in to submit a grievance.", type: "error" });
      return;
    }
    if (!title || !description) {
      setModal({ show: true, title: "Error", message: "Title and description are required.", type: "error" });
      return;
    }
    setLoading(true);

    try {
      // 🧠 Call Gemini AI to get priority, category, and summary
      const aiData = await analyzeGrievanceWithAI(title, description);

      const newGrievance = {
        title,
        description,
        location,
        submitterUserId: user.id,
        ...aiData, // Add AI-generated data
      };

      await createGrievance(newGrievance, token);

      setModal({ show: true, title: "Success", message: "Grievance submitted successfully!", type: "success" });
      setTitle("");
      setDescription("");
      setLocation(null);
      if(onGrievanceSubmitted) onGrievanceSubmitted();
    } catch (error) {
      console.error("Grievance submission error:", error);
      setModal({ show: true, title: "Error", message: "Failed to submit grievance.", type: "error" });
    } finally {
      setLoading(false);
    }
  };
  
  const handleLocationSelect = (selectedLocation) => {
    setLocation(selectedLocation);
    setShowMapModal(false);
  };

  return (
    <>
      <motion.div
        className="glass-panel-strong hover-lift mx-auto max-w-2xl rounded-2xl p-8 text-slate-800"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-emerald-700">
          Civic intake
        </p>
        <h2 className="font-space-grotesk mb-6 bg-gradient-to-r from-emerald-700 to-sky-700 bg-clip-text text-center text-3xl font-extrabold text-transparent">
          Submit a New Grievance
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            type="text"
            placeholder="Grievance Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Textarea
            placeholder="Describe the issue in detail"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          
          <div className="text-sm text-slate-600">
            <Button type="button" onClick={() => setShowMapModal(true)}>
                {location ? "Change Location" : "Add Location"}
            </Button>
            {location && <span className="ml-4">{location.address}</span>}
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Submitting..." : "Submit Grievance"}
          </Button>
        </form>
      </motion.div>

      <Modal
        show={modal.show}
        title={modal.title}
        type={modal.type}
        onClose={() => setModal({ ...modal, show: false })}
      >
        <p>{modal.message}</p>
      </Modal>

      {showMapModal && (
        <MapPicker
          onLocationSelect={handleLocationSelect}
          onClose={() => setShowMapModal(false)}
        />
      )}
    </>
  );
}

export default SubmitGrievancePage;
