// src/utils/travelValidation.js
//
// Checks on travel itinerary legs before submit (employee Travel screen and the admin
// "apply on behalf" form). The server runs the same checks (_validate_travel_itinerary).

const dayOf = (d) => (d instanceof Date ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : null);

/**
 * @param {Array} itinerary legs as held in the form state (dates are Date objects)
 * @returns {{ text1: string, text2?: string } | null} toast content for the first problem, or null
 */
export const validateItinerary = (itinerary = []) => {
    for (let i = 0; i < itinerary.length; i += 1) {
        const leg = itinerary[i];
        const name = itinerary.length > 1 ? `Leg ${i + 1}` : 'The trip';

        if (!String(leg.travel_from || '').trim() || !String(leg.travel_to || '').trim()) {
            return { text1: 'Enter where you travel from and to', text2: name };
        }
        if (leg.departure_date instanceof Date && leg.arrival_date instanceof Date
            && leg.arrival_date.getTime() < leg.departure_date.getTime()) {
            return { text1: 'Arrival can’t be before departure', text2: name };
        }
        if (leg.lodging_required && dayOf(leg.check_in_date) !== null && dayOf(leg.check_out_date) !== null
            && dayOf(leg.check_out_date) < dayOf(leg.check_in_date)) {
            return { text1: 'Hotel check-out can’t be before check-in', text2: name };
        }
        if (leg.travel_advance_required && !(parseFloat(leg.advance_amount) > 0)) {
            return { text1: 'Enter the advance amount', text2: name };
        }
    }
    return null;
};
